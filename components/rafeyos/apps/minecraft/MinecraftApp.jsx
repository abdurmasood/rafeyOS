'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls, Sky } from '@react-three/drei'
import * as THREE from 'three'

const BLOCK_SIZE = 1
const WORLD_SIZE = 16
const GRAVITY = -30
const JUMP_FORCE = 8
const MOVE_SPEED = 5

const BLOCK_TYPES = [
  { id: 'grass', color: '#4a7c3f' },
  { id: 'dirt', color: '#8b5a2b' },
  { id: 'stone', color: '#7a7a7a' },
  { id: 'wood', color: '#8b6f47' },
  { id: 'sand', color: '#c2b280' },
]

function generateWorld() {
  const blocks = []
  for (let x = -WORLD_SIZE / 2; x < WORLD_SIZE / 2; x++) {
    for (let z = -WORLD_SIZE / 2; z < WORLD_SIZE / 2; z++) {
      const height = Math.floor(Math.sin(x * 0.3) * Math.cos(z * 0.3) * 2) + 2
      for (let y = 0; y <= height; y++) {
        const type = y === height ? 'grass' : y > height - 2 ? 'dirt' : 'stone'
        blocks.push({ x, y, z, type })
      }
    }
  }
  return blocks
}

function Player({ blocks, setBlocks, selectedBlock }) {
  const { camera, gl } = useThree()
  const velocity = useRef(new THREE.Vector3())
  const direction = useRef(new THREE.Vector3())
  const keys = useRef({})
  const onGround = useRef(false)

  useEffect(() => {
    const onKey = (e, down) => {
      keys.current[e.code] = down
      if (e.code === 'Space' && down && onGround.current) {
        velocity.current.y = JUMP_FORCE
        onGround.current = false
      }
    }
    const down = (e) => onKey(e, true)
    const up = (e) => onKey(e, false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useFrame((_, delta) => {
    let forward = 0
    let right = 0
    if (keys.current.KeyW) forward += 1
    if (keys.current.KeyS) forward -= 1
    if (keys.current.KeyA) right -= 1
    if (keys.current.KeyD) right += 1

    direction.current.set(right, 0, -forward).normalize()
    direction.current.applyQuaternion(camera.quaternion)
    direction.current.y = 0
    direction.current.normalize()

    velocity.current.x = direction.current.x * MOVE_SPEED
    velocity.current.z = direction.current.z * MOVE_SPEED
    velocity.current.y += GRAVITY * delta

    camera.position.addScaledVector(velocity.current, delta)

    // Simple ground collision
    if (camera.position.y < 2) {
      camera.position.y = 2
      velocity.current.y = 0
      onGround.current = true
    }
  })

  const handleClick = useCallback((e) => {
    e.stopPropagation()
    const point = e.point
    const normal = e.face?.normal
    if (!point || !normal) return

    if (e.button === 0) {
      // Break block
      const bx = Math.round(point.x - normal.x * 0.5)
      const by = Math.round(point.y - normal.y * 0.5)
      const bz = Math.round(point.z - normal.z * 0.5)
      setBlocks((prev) => prev.filter((b) => !(b.x === bx && b.y === by && b.z === bz)))
    } else if (e.button === 2) {
      // Place block
      const bx = Math.round(point.x + normal.x * 0.5)
      const by = Math.round(point.y + normal.y * 0.5)
      const bz = Math.round(point.z + normal.z * 0.5)
      setBlocks((prev) => [...prev, { x: bx, y: by, z: bz, type: selectedBlock }])
    }
  }, [selectedBlock, setBlocks])

  return (
    <>
      <PointerLockControls selector="#minecraft-canvas" />
      <mesh onPointerDown={handleClick} visible={false}>
        <boxGeometry args={[100, 100, 100]} />
      </mesh>
    </>
  )
}

function Blocks({ blocks }) {
  return blocks.map((b, i) => (
    <mesh key={`${b.x}-${b.y}-${b.z}-${i}`} position={[b.x, b.y, b.z]}>
      <boxGeometry args={[BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE]} />
      <meshLambertMaterial color={BLOCK_TYPES.find((t) => t.id === b.type)?.color || '#888'} />
    </mesh>
  ))
}

export function MinecraftApp() {
  const [blocks, setBlocks] = useState(() => generateWorld())
  const [selected, setSelected] = useState(0)
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    const onContext = (e) => e.preventDefault()
    window.addEventListener('contextmenu', onContext)
    return () => window.removeEventListener('contextmenu', onContext)
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#87ceeb' }}>
      <Canvas id="minecraft-canvas" camera={{ position: [0, 5, 10], fov: 75 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 20, 10]} intensity={0.8} />
        <Sky sunPosition={[100, 20, 100]} />
        <Blocks blocks={blocks} />
        <Player blocks={blocks} setBlocks={setBlocks} selectedBlock={BLOCK_TYPES[selected].id} />
      </Canvas>

      {/* Hotbar */}
      <div style={{
        position: 'absolute',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 6,
        background: 'rgba(0,0,0,0.6)',
        padding: 8,
        borderRadius: 8,
      }}>
        {BLOCK_TYPES.map((t, i) => (
          <button
            key={t.id}
            onClick={() => setSelected(i)}
            style={{
              width: 40,
              height: 40,
              background: t.color,
              border: i === selected ? '3px solid white' : '3px solid transparent',
              borderRadius: 4,
              cursor: 'pointer',
            }}
            title={t.id}
          />
        ))}
      </div>

      {/* Crosshair */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: 16,
        height: 16,
        margin: '-8px 0 0 -8px',
        border: '2px solid white',
        borderRadius: '50%',
        pointerEvents: 'none',
        opacity: 0.8,
      }} />

      {/* Hint */}
      <div style={{
        position: 'absolute',
        top: 12,
        left: 12,
        color: 'white',
        fontSize: 13,
        textShadow: '0 1px 2px black',
        pointerEvents: 'none',
      }}>
        Click to lock mouse · WASD move · Space jump<br />
        Left click break · Right click place
      </div>
    </div>
  )
}
