const BIRTH = { year: 1997, month: 1, day: 18 };

function age(asOf = new Date()) {
  let years = asOf.getFullYear() - BIRTH.year;
  const month = asOf.getMonth() + 1;
  const day = asOf.getDate();
  if (month < BIRTH.month || (month === BIRTH.month && day < BIRTH.day)) {
    years -= 1;
  }
  return years;
}

const bioDescription = () => `Rafey is a ${age()}-year-old self-taught full-stack developer with a passion for building. He obtained his postgraduate degree from King's College London with a focus on Artificial Intelligence in 2024. He is originally from Islamabad, Pakistan.

In 2016, he moved to the United Kingdom on a full scholarship to pursue an undergraduate degree in Computer Science from King's College London. He proceeded to work on some interesting projects over the preceding years before starting his own company in 2024.

Some of his notable achievements include:
- Built a pet entertainment business based on generative AI that garnered strong interest among notable VCs.
- Created a Python library for a space company to facilitate data transfer between ground stations and satellites.
- Prototyped a web application for the NHS to detect irregularities in MRI scans.
- Founded a record label and set up a recording studio in East London.`;

const projectsOptions = "description  show\n\nUsage: project &lt;option&gt;";
const projectsDescription = "Project Description";
// Category, then each tool's name and homepage, in the order they print
const SKILLS = Object.freeze([
    ['stack', [
        ['cursor', 'https://cursor.com'],
        ['claude code', 'https://claude.com/product/claude-code'],
        ['orca', 'https://www.onorca.dev'],
        ['linear', 'https://linear.app'],
        ['github', 'https://github.com'],
        ['1password', 'https://1password.com'],
        ['greptile', 'https://greptile.com'],
    ]],
    ['inference', [
        ['baseten', 'https://baseten.co'],
        ['anthropic', 'https://anthropic.com'],
        ['openai', 'https://openai.com'],
        ['modal', 'https://modal.com'],
        ['huggingface', 'https://huggingface.co'],
    ]],
    ['backend', [
        ['fastapi', 'https://fastapi.tiangolo.com'],
        ['typescript', 'https://www.typescriptlang.org'],
    ]],
    ['ml', [
        ['pandas', 'https://pandas.pydata.org'],
        ['pytorch', 'https://pytorch.org'],
    ]],
    ['frontend', [
        ['next.js', 'https://nextjs.org'],
        ['vercel', 'https://vercel.com'],
    ]],
    ['observability', [
        ['braintrust', 'https://www.braintrust.dev'],
    ]],
    ['cloud', [
        ['aws', 'https://aws.amazon.com'],
        ['gcp', 'https://cloud.google.com'],
    ]],
    ['auth', [
        ['workos', 'https://workos.com'],
    ]],
]);

// Tools start 3 columns past the longest category in the plain-text copy (rafeyOS's skills.txt),
// matching the home terminal's 3ch grid gap
const SKILLS_TOOL_COLUMN = Math.max(...SKILLS.map(([category]) => category.length)) + 3;

// The home terminal lays these rows out as a grid so wrapped tools stay under their column.
// &nbsp; before each separator keeps a wrapped line from starting with "·".
const skillRow = ([category, tools]) =>
    `<span class='dim'>${category.padEnd(SKILLS_TOOL_COLUMN)}</span>` +
    `<span>${tools.map(([name, url]) =>
        `<a class='skill' href='${url}' target='_blank' rel='noopener noreferrer'>${name}</a>`).join('&nbsp;· ')}</span>`;

const skillsDescription = `<div class='skill-rows'>${SKILLS.map(skillRow).join('\n')}</div>`;

const catDescription = "Usage: cat &lt;file-name&gt;";
const readMeDescription = `
 __  __     ______     __         __         ______        __     __     ______     ______     __         _____    
/\\ \\_\\ \\   /\\  ___\\   /\\ \\       /\\ \\       /\\  __ \\      /\\ \\  _ \\ \\   /\\  __ \\   /\\  == \\   /\\ \\       /\\  __-.  
\\ \\  __ \\  \\ \\  __\\   \\ \\ \\____  \\ \\ \\____  \\ \\ \\/\\ \\     \\ \\ \\/ ".\\ \\  \\ \\ \\/\\ \\  \\ \\  __<   \\ \\ \\____  \\ \\ \\/\\ \\ 
 \\ \\_\\ \\_\\  \\ \\_____\\  \\ \\_____\\  \\ \\_____\\  \\ \\_____\\     \\ \\__/".~\\_\\  \\ \\_____\\  \\ \\_\\ \\_\\  \\ \\_____\\  \\ \\____- 
  \\/_/\\/_/   \\/_____/   \\/_____/   \\/_____/   \\/_____/      \\/_/   \\/_/   \\/_____/   \\/_/ /_/   \\/_____/   \\/____/ 
                                                                                                                   
`;

const compactReadme = `█ █ █▀▀ █   █   █▀█   █ █ █ █▀█ █▀█ █   █▀▄
█▀█ ██▄ █▄▄ █▄▄ █▄█   ▀▄▀▄▀ █▄█ █▀▄ █▄▄ █▄▀
`;

export {
    age,
    compactReadme,
    bioDescription,
    projectsOptions,
    projectsDescription,
    catDescription,
    readMeDescription,
    skillsDescription,
    SKILLS
};
