// App id -> UI component, for exactly core/catalog/apps.js IMPLEMENTED_APPS (checked by tests/rafeyos/apps/appRegistry.test.jsx).
import { APP } from '@/components/rafeyos/core/catalog/apps'
import { FilesApp } from './files/FilesApp'
import { TerminalApp } from './terminal/TerminalApp'
import { EditorApp } from './editor/EditorApp'
import { MailApp } from './mail/MailApp'
import { PropertiesApp } from './properties/PropertiesApp'
import { MusicApp } from './music/MusicApp'
import { SettingsApp } from './settings/SettingsApp'
import { ProjectsApp } from './projects/ProjectsApp'
import { BlocksApp } from './blocks/BlocksApp'

export const APP_COMPONENTS = Object.freeze({
  [APP.FILES]: FilesApp,
  [APP.TERMINAL]: TerminalApp,
  [APP.EDITOR]: EditorApp,
  [APP.MUSIC]: MusicApp,
  [APP.MAIL]: MailApp,
  [APP.PROJECTS]: ProjectsApp,
  [APP.SETTINGS]: SettingsApp,
  [APP.PROPERTIES]: PropertiesApp,
  [APP.BLOCKS]: BlocksApp,
})
