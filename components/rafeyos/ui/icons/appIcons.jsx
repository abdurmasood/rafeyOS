// Full-colour 48px app icons from the approved mockup
import { useId } from 'react'
import { APP } from '@/components/rafeyos/core/catalog/apps'

const FilesIcon = () => (
  <>
    <rect x="5" y="9" width="38" height="31" rx="5" fill="#7f7f7f" />
    <path d="M5 17h38v18a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z" fill="#ececec" />
    <path d="M5 17h38v3H5z" fill="#d6d6d6" />
    <rect x="18" y="26" width="12" height="3.5" rx="1.75" fill="#a6a6a6" />
  </>
)

const TerminalIcon = () => (
  <>
    <rect x="4" y="7" width="40" height="34" rx="6" fill="#4a4a4a" />
    <rect x="6" y="13" width="36" height="26" rx="3" fill="#161616" />
    <circle cx="9.5" cy="10" r="1.3" fill="#9a9a9a" />
    <circle cx="13.5" cy="10" r="1.3" fill="#9a9a9a" />
    <path d="M12 21l5 4-5 4" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 30h9" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
  </>
)

const EditorIcon = () => (
  <>
    <path d="M12 5h18l9 9v26a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill="#f6f6f6" />
    <path d="M30 5v9h9z" fill="#d4d4d4" />
    <path d="M15 20h17M15 25h17M15 30h12" stroke="#9e9e9e" strokeWidth="2" strokeLinecap="round" />
    <path d="M33 26l7-7 3 3-7 7-4 1z" fill="#E95420" />
    <path d="M40 19l3 3" stroke="#a63c16" strokeWidth="1.5" />
  </>
)

// The gradient id must be unique per instance: the dock and the calendar can show it together
const MusicIcon = () => {
  const gradientId = useId()
  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff9a3c" />
          <stop offset="1" stopColor="#d9431a" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="19" fill={`url(#${gradientId})`} />
      <circle cx="24" cy="24" r="12.5" fill="none" stroke="rgba(0,0,0,.18)" strokeWidth="1" />
      <circle cx="24" cy="24" r="7" fill="#2b2b2b" />
      <circle cx="24" cy="24" r="2" fill="#fff" />
    </>
  )
}

export const MailIcon = () => (
  <>
    <rect x="5" y="10" width="38" height="28" rx="4" fill="#f4f4f4" />
    <path d="M5 14l19 13 19-13" fill="none" stroke="#3584e4" strokeWidth="3" strokeLinejoin="round" />
    <path d="M5 34l13-10M43 34L30 24" stroke="#c9c9c9" strokeWidth="1.5" />
  </>
)

/** The wireframe sphere from the /projects scene, tilted, with a soft top-left light. */
const WireGlobe = () => {
  // Unique per instance, like the Music icon: the dock and the app grid can show it together
  const gradientId = useId()
  return (
    <>
      <defs>
        <radialGradient id={gradientId} cx=".35" cy=".3" r=".9">
          <stop offset="0" stopColor="#fff" stopOpacity=".22" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="13.5" fill={`url(#${gradientId})`} />
      <g fill="none" stroke="#f2f2f2" strokeWidth="1.5" transform="rotate(-20 24 24)">
        <circle cx="24" cy="24" r="13.5" strokeWidth="2" />
        <ellipse cx="24" cy="24" rx="6.8" ry="13.5" />
        <path d="M24 10.5v27" />
        <ellipse cx="24" cy="24" rx="13.5" ry="4.2" />
        <path d="M12.2 17.5a12 3.2 0 0 0 23.6 0M12.2 30.5a12 3.2 0 0 0 23.6 0" opacity=".7" />
      </g>
    </>
  )
}

const ProjectsIcon = () => (
  <>
    <rect x="5" y="5" width="38" height="38" rx="9" fill="#141414" />
    <WireGlobe />
  </>
)

// Minecraft app icon: classic 8×8 creeper face (original pixel SVG, not Mojang art)
const CREEPER_GREEN = '#5d9c3d'
const CREEPER_BLACK = '#1a1a1a'
/** 1 = face pixel. Rows top → bottom. */
const CREEPER_FACE = Object.freeze([
  Object.freeze([0, 0, 0, 0, 0, 0, 0, 0]),
  Object.freeze([0, 0, 0, 0, 0, 0, 0, 0]),
  Object.freeze([0, 1, 1, 0, 0, 1, 1, 0]),
  Object.freeze([0, 1, 1, 0, 0, 1, 1, 0]),
  Object.freeze([0, 0, 0, 1, 1, 0, 0, 0]),
  Object.freeze([0, 0, 1, 1, 1, 1, 0, 0]),
  Object.freeze([0, 0, 1, 0, 0, 1, 0, 0]),
  Object.freeze([0, 0, 0, 0, 0, 0, 0, 0]),
])

/**
 * Flat creeper face logo. `ground` draws the green square; skip it when the tile is already green.
 * @param {{ x?: number, y?: number, size?: number, ground?: boolean }} props
 */
const CreeperFace = ({ x = 4, y = 4, size = 40, ground = true }) => {
  const cell = size / 8
  return (
    <>
      {ground && <rect x={x} y={y} width={size} height={size} fill={CREEPER_GREEN} />}
      {CREEPER_FACE.flatMap((row, j) =>
        row.map((bit, i) =>
          bit ? (
            <rect
              key={`${i}-${j}`}
              x={x + i * cell}
              y={y + j * cell}
              width={cell}
              height={cell}
              fill={CREEPER_BLACK}
            />
          ) : null,
        ),
      )}
    </>
  )
}

/** Classic flat creeper face for the dock / menu list. */
const MinecraftIcon = () => <CreeperFace />

const SettingsIcon = () => (
  <>
    <circle cx="24" cy="24" r="14" fill="none" stroke="#9b9b9b" strokeWidth="7" strokeDasharray="5.2 3.6" />
    <circle cx="24" cy="24" r="12" fill="#8a8a8a" />
    <circle cx="24" cy="24" r="5" fill="#3d3d3d" />
  </>
)

/** `full` draws a sheet sticking out of the lid, the way a Mac bin does once it holds a file. */
export const TrashIcon = ({ full = false }) => (
  <>
    <path d="M12 14h24l-2.2 26a3 3 0 0 1-3 2.7H17.2a3 3 0 0 1-3-2.7z" fill="#bdbdbd" />
    {full && <path data-paper d="M17 3h9l5 5v8H17z" fill="#f7f7f7" />}
    <rect x="9" y="9" width="30" height="6" rx="2" fill="#9a9a9a" />
    <path d="M20 20v16M24 20v16M28 20v16" stroke="#8a8a8a" strokeWidth="2" strokeLinecap="round" />
  </>
)

const GRID_STOPS = [13, 24, 35]

const ShowAppsIcon = () => (
  <g fill="#fff">
    {GRID_STOPS.flatMap((y) => GRID_STOPS.map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="3.4" />))}
  </g>
)

const PropertiesIcon = () => (
  <>
    <rect x="6" y="6" width="36" height="36" rx="18" fill="#777" />
    <path d="M24 22v12M24 15v.1" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
  </>
)

const APP_ICON_BODIES = Object.freeze({
  [APP.FILES]: FilesIcon,
  [APP.TERMINAL]: TerminalIcon,
  [APP.EDITOR]: EditorIcon,
  [APP.MUSIC]: MusicIcon,
  [APP.MAIL]: MailIcon,
  [APP.PROJECTS]: ProjectsIcon,
  [APP.MINECRAFT]: MinecraftIcon,
  [APP.SETTINGS]: SettingsIcon,
  [APP.PROPERTIES]: PropertiesIcon,
  trash: TrashIcon,
  apps: ShowAppsIcon,
})

// Tile icons: one squircle silhouette for the launcher surfaces (dock, app grid)

/** A 48px squircle, light at the top; dark tiles get a faint rim so they don't sink into the glass. */
const Tile = ({ from, to, rim = false, children }) => {
  // Unique per instance, like the Music icon: the dock and the app grid can show a tile together
  const gradientId = useId()
  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="11" fill={`url(#${gradientId})`} />
      {rim && <rect x=".5" y=".5" width="47" height="47" rx="10.5" fill="none" stroke="rgba(255,255,255,.1)" />}
      {children}
    </>
  )
}

const FilesTile = () => (
  <Tile from="#f5f5f5" to="#dcdcdc">
    <rect x="10" y="13" width="28" height="22" rx="3.5" fill="#7f7f7f" />
    <path d="M10 19h28v12.5a3.5 3.5 0 0 1-3.5 3.5h-21a3.5 3.5 0 0 1-3.5-3.5z" fill="#b5b5b5" />
    <rect x="20" y="25" width="8" height="2.6" rx="1.3" fill="#8a8a8a" />
  </Tile>
)

const TerminalTile = () => (
  <Tile from="#2e2e2e" to="#151515" rim>
    <path d="M14 18l6 6-6 6" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M23 31h11" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
  </Tile>
)

const EditorTile = () => (
  <Tile from="#fdfdfd" to="#e8e8e8">
    <path d="M14 16h20M14 22h20M14 28h12" stroke="#a3a3a3" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M27 34l9-9 3 3-9 9-4.5 1z" fill="#E95420" />
  </Tile>
)

const MusicTile = () => (
  <Tile from="#ff9a3c" to="#e2501f">
    <circle cx="24" cy="24" r="12" fill="#2b2b2b" />
    <circle cx="24" cy="24" r="8" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="1" />
    <circle cx="24" cy="24" r="3" fill="#ff9a3c" />
  </Tile>
)

const MailTile = () => (
  <Tile from="#4f9af0" to="#2a6fcf">
    <rect x="11" y="15" width="26" height="18" rx="3" fill="#fff" />
    <path d="M12 16.5l12 8.5 12-8.5" fill="none" stroke="#2a6fcf" strokeWidth="2.2" strokeLinejoin="round" />
  </Tile>
)

const ProjectsTile = () => (
  <Tile from="#2a2a2a" to="#0a0a0a" rim>
    <WireGlobe />
  </Tile>
)

/** Creeper face filling the launcher squircle. */
const MinecraftTile = () => (
  <Tile from="#6f9f46" to="#4a7a2e" rim>
    <CreeperFace x={0} y={0} size={48} ground={false} />
  </Tile>
)

const SettingsTile = () => (
  <Tile from="#a5a5a5" to="#737373">
    <circle cx="24" cy="24" r="11" fill="none" stroke="#2f2f2f" strokeWidth="5" strokeDasharray="3.9 2.9" />
    <circle cx="24" cy="24" r="9" fill="#2f2f2f" />
    <circle cx="24" cy="24" r="3.6" fill="#8c8c8c" />
  </Tile>
)

const PropertiesTile = () => (
  <Tile from="#8a8a8a" to="#666">
    <path d="M24 22v12M24 15v.1" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
  </Tile>
)

/** `full` keeps the sheet sticking out of the lid, as on TrashIcon. */
const TrashTile = ({ full = false }) => (
  <Tile from="#3c3c3c" to="#242424" rim>
    <path d="M16.5 19h15l-1.4 15.2a2 2 0 0 1-2 1.8h-8.2a2 2 0 0 1-2-1.8z" fill="#cfcfcf" />
    {full && <path data-paper d="M19 8h7l4 4v6H19z" fill="#f7f7f7" />}
    <rect x="14" y="14.5" width="20" height="3.6" rx="1.6" fill="#cfcfcf" />
    <path d="M21.5 23v9M26.5 23v9" stroke="#8a8a8a" strokeWidth="1.6" strokeLinecap="round" />
  </Tile>
)

const TILE_GRID_STOPS = [16, 24, 32]

const ShowAppsTile = () => (
  <Tile from="#3c3c3c" to="#242424" rim>
    <g fill="#fff">
      {TILE_GRID_STOPS.flatMap((y) => TILE_GRID_STOPS.map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" />))}
    </g>
  </Tile>
)

const APP_TILE_BODIES = Object.freeze({
  [APP.FILES]: FilesTile,
  [APP.TERMINAL]: TerminalTile,
  [APP.EDITOR]: EditorTile,
  [APP.MUSIC]: MusicTile,
  [APP.MAIL]: MailTile,
  [APP.PROJECTS]: ProjectsTile,
  [APP.MINECRAFT]: MinecraftTile,
  [APP.SETTINGS]: SettingsTile,
  [APP.PROPERTIES]: PropertiesTile,
  trash: TrashTile,
  apps: ShowAppsTile,
})

/**
 * @param {{ name: string, className?: string, full?: boolean, tile?: boolean }} props - an app id, or
 *   'trash' / 'apps'. `full` is the Trash bin; `tile` draws the squircle launcher icon.
 */
export const AppIcon = ({ name, className, full = false, tile = false }) => {
  const Body = (tile ? APP_TILE_BODIES : APP_ICON_BODIES)[name]
  if (!Body) throw new Error(`Unknown app icon: ${name}`)
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <Body full={full} />
    </svg>
  )
}
