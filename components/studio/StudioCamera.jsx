import { useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import { cameraPose, containFovDeg } from '@/lib/studio/camera'
import { REF_HALF_TAN, manifest } from '@/lib/studio/manifest'

const NEAR = 5
const FAR = 200

/** The render camera's exact pose; only the field of view follows the canvas. */
export function StudioCamera() {
  const aspect = useThree((state) => state.size.width / state.size.height)
  const { position, quaternion } = useMemo(() => cameraPose(manifest.camera.matrix), [])
  return (
    <PerspectiveCamera
      makeDefault
      position={position}
      quaternion={quaternion}
      fov={containFovDeg(aspect, REF_HALF_TAN)}
      near={NEAR}
      far={FAR}
    />
  )
}
