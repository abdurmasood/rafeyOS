import { useLayoutEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import { ROOM_VIEW, cameraPose, containFovDeg, roomViewOffset } from '@/lib/studio/camera'
import { REF_HALF_TAN, manifest } from '@/lib/studio/manifest'

const NEAR = 5
const FAR = 200

/**
 * The render camera's exact pose, so the plates line up; only the lens changes. It frames the room
 * (ROOM_VIEW) rather than the whole render, by narrowing the view of the contain-fitted frame.
 */
export function StudioCamera() {
  const size = useThree((state) => state.size)
  const aspect = size.width / size.height
  const { position, quaternion } = useMemo(() => cameraPose(manifest.camera.matrix), [])
  const camera = useRef(null)
  useLayoutEffect(() => {
    const view = roomViewOffset(size, ROOM_VIEW)
    camera.current.setViewOffset(view.fullWidth, view.fullHeight, view.x, view.y, view.width, view.height)
    camera.current.updateProjectionMatrix()
  }, [size])
  return (
    <PerspectiveCamera
      ref={camera}
      makeDefault
      position={position}
      quaternion={quaternion}
      fov={containFovDeg(aspect, REF_HALF_TAN)}
      near={NEAR}
      far={FAR}
    />
  )
}
