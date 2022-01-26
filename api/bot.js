import chromium from "chrome-aws-lambda";

import { words as validWords } from "./words";

const WORDLE_URL = "https://www.powerlanguage.co.uk/wordle/";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function getLetters(page, index) {
  return await page.evaluate((index) => {
    const getLetterValues = (tile) => ({
      letter: tile._letter,
      state: tile._state,
    });

    const row = document
      .querySelector("body > game-app")
      .shadowRoot.querySelector(`#board > game-row:nth-child(${index})`)
      .shadowRoot.querySelector("div");

    const letterValues = Array.from(row.children).map(getLetterValues);

    return letterValues;
  }, index);
}

export default async function handler(req, res) {
  const browser = await chromium.puppeteer.launch({
    args: [...chromium.args, "--hide-scrollbars", "--disable-web-security"],
    executablePath: await chromium.executablePath,
    headless: false,
    defaultViewport: null,
  });

  const context = await browser.createIncognitoBrowserContext();

  const page = await context.newPage();

  await page.goto(WORDLE_URL, { waitUntil: "networkidle0" });

  await sleep(2000);

  const startingWords = ["raise", "soare", "bough"];

  const greenLetters = [];
  let yellowLetters = [];
  const excluded = [];

  const filterGuesses = (words) => {
    return words
      .filter((word) => {
        if (!yellowLetters.length) return true;
        return yellowLetters.every(({ letter, index }) => {
          return word.includes(letter) && word[index] !== letter;
        });
      })
      .filter((word) => {
        if (!greenLetters.length) return true;
        return greenLetters.every(({ letter, index }) => {
          return word[index] === letter;
        });
      })
      .filter((word) => {
        if (!excluded.length) return true;
        return excluded.every((letter) => !word.includes(letter));
      });
  };

  await page.evaluate(() => {
    const x = document
      .querySelector("body > game-app")
      .shadowRoot.querySelector("#game > game-modal")
      .shadowRoot.querySelector("div > div > div > game-icon");
    x.click();
  });

  await sleep(2000);

  const startingWord = randomPick(startingWords);

  await page.keyboard.type(startingWord);

  await sleep(1000);

  await page.keyboard.press("Enter");

  await sleep(2000);

  for (let i = 1; i < 6; i++) {
    const letters = await getLetters(page, i);

    if (letters.every(({ state }) => state === "correct")) {
      break;
    }

    for (const letter of letters) {
      if (
        letter.state === "absent" &&
        !greenLetters.find((entry) => entry.letter === letter.letter)
      ) {
        excluded.push(letter.letter);
      } else if (letter.state === "present") {
        if (
          !yellowLetters.find(
            (entry) =>
              entry.letter === letter.letter &&
              entry.index === letters.indexOf(letter)
          )
        ) {
          yellowLetters.push({
            letter: letter.letter,
            index: letters.indexOf(letter),
          });
        }
      } else if (letter.state === "correct") {
        if (!greenLetters.find((entry) => entry.letter === letter.letter)) {
          greenLetters.push({
            letter: letter.letter,
            index: letters.indexOf(letter),
          });
          const isYellowLetter = yellowLetters.findIndex(
            (entry) => entry.letter === letter.letter
          );
          if (isYellowLetter !== -1) {
            yellowLetters = yellowLetters.filter(
              (entry) => entry.letter !== letter.letter
            );
          }
          if (excluded.includes(letter.letter)) {
            excluded.splice(
              excluded.findIndex((entry) => entry === letter.letter),
              1
            );
          }
        }
      }
    }

    const validGuesses = filterGuesses(validWords);

    const guess = randomPick(validGuesses);

    await page.keyboard.type(guess);

    await sleep(1000);

    await page.keyboard.press("Enter");

    await sleep(3000);
  }

  return res.status(200).json("finished");
}
