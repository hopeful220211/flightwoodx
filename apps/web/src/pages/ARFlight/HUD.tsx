import { useState, useEffect, useRef } from 'react'
import { X, MapPin } from 'lucide-react'

interface HUDProps {
  altitude: number
  onExit: () => void
  onFirstTouch: () => void
}

export function HUD({ altitude, onExit, onFirstTouch }: HUDProps) {
  const [showHint, setShowHint] = useState(true)
  const hintDismissed = useRef(false)

  // Auto-dismiss hint after 5s
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowHint(false)
    }, 5000)
    return () => clearTimeout(timer)
  }, [])

  // Dismiss on first touch
  const handleFirstTouch = () => {
    if (!hintDismissed.current) {
      hintDismissed.current = true
      setShowHint(false)
    }
    onFirstTouch()
  }

  return (
    <>
      {/* Altitude indicator — top left */}
      <div className="pointer-events-none absolute top-6 left-6 flex items-center gap-2">
        <MapPin size={16} className="text-white drop-shadow-md" />
        <span className="text-sm font-medium text-white drop-shadow-md">
          模拟高度：{altitude.toFixed(1)}m
        </span>
      </div>

      {/* Exit button — top right */}
      <button
        onClick={onExit}
        className="pointer-events-auto absolute top-6 right-6 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 transition-colors"
        aria-label="退出摄像头模拟"
      >
        <X size={20} />
      </button>

      {/* Control hint — bottom center, auto-dismiss */}
      {showHint && (
        <div
          className="pointer-events-none absolute bottom-32 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/50 backdrop-blur-sm rounded-md text-sm text-white text-center whitespace-nowrap transition-opacity duration-500"
          style={{ opacity: showHint ? 1 : 0 }}
        >
          左摇杆：升降、左右移动 &nbsp;&nbsp; 右摇杆：前后移动、旋转
        </div>
      )}

      {/* Landscape prompt (shown once if portrait) */}
      <LandscapePrompt />

      {/* Expose handleFirstTouch for JoystickOverlay */}
      <HUDFirstTouchBridge onFirstTouch={handleFirstTouch} />
    </>
  )
}

// Hidden bridge: passes handleFirstTouch up without re-rendering
function HUDFirstTouchBridge({ onFirstTouch }: { onFirstTouch: () => void }) {
  // Store in window for JoystickOverlay to call
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__arHudFirstTouch = onFirstTouch
    return () => { delete (window as unknown as Record<string, unknown>).__arHudFirstTouch }
  }, [onFirstTouch])
  return null
}

function LandscapePrompt() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const check = () => {
      if (typeof window !== 'undefined' && window.innerHeight > window.innerWidth) {
        setShow(true)
      }
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  if (!show) return null

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
      <div className="bg-ink-900 rounded-lg p-8 text-center max-w-sm mx-4">
        <p className="text-3xl mb-3">🔄</p>
        <p className="text-lg font-medium text-white mb-2">建议使用横屏</p>
        <p className="text-sm text-ink-400 mb-6">横屏可同时查看画面和两个摇杆。</p>
        <button
          onClick={() => setShow(false)}
          className="px-6 py-2 text-sm font-medium text-white bg-wood-500 rounded-md hover:brightness-[0.92]"
        >
          继续
        </button>
      </div>
    </div>
  )
}
