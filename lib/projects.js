// Shared by the terminals' picker and the rafeyOS filesystem.
// Keep order and disabled entries: the filesystem links each project's .txt file by its index in this full list.
export const projects = [
  { id: 1, title: "Arrhythmia Detector", description: "Developed a convolutional Neural Network based on Google's AlexNet deep learning architecture to detect different types of arrhythmia with 94% accuracy.", link: "https://github.com/abdurmasood/arrhythmia-classification" },
  { id: 2, title: "Neuro Scan", description: "Built web application for the NHS to visualise abnormalities in MRI scans & ease physician workload in detecting parameter anomalies.", link: "https://topol.digitalacademy.nhs.uk/digital-fellowships/case-studies/haris-shuaib" },
  { id: 3, title: "Home-Work", description: "Used Google Gemini & GCP to bulid a web application with the aim to find grammatical errors in student homework.", disabled: true },
  { id: 4, title: "Leaf Line", description: "Coded python library for a leading space company to ensure fast, secure, and efficient data transmission between ground stations and satellites in LEO.", link: "https://leaf.space/leaf-line/" },
  { id: 5, title: "Magnitude", description: "A set of skills for improving a code writing flow (driven by agents) by an order of magnitude. Usable with Claude Code, Cursor and Codex.", link: "https://github.com/abdurmasood/magnitude" },
  { id: 6, title: "Hotel Price Tracker", description: "Used python scripting to automate the process of checking hotel prices to get the best deals.", disabled: true },
  { id: 7, title: "Rafey Shell", description: "Built a digital twin you can install from npm. Run rafey-shell and ask anything you need to know about Rafey straight from the terminal.", link: "https://github.com/abdurmasood/rafey-shell" },
]

// A github.com URL is the source. Every other project link is a case study.
export const linkName = (url) => (new URL(url).hostname.replace(/^www\./, '') === 'github.com' ? 'source' : 'case study')

export const getVisibleProjects = () => projects.filter((project) => !project.disabled)

export const getProjectById = (id) => projects.find((project) => project.id === id)
