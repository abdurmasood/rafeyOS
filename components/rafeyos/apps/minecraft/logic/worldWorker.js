// The world worker's entry, unchecked because the worker global doesn't typecheck against the DOM lib; the work and
// its tests live in worldBuild.js
import { handleBuildMessage } from './worldBuild'

self.onmessage = (event) => handleBuildMessage(event.data, (message, transfer) => self.postMessage(message, transfer))
