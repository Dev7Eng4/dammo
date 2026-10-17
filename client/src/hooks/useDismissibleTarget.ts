import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * State for "open a modal for this item". Closing flips `open` to false first and only clears
 * `target` after `exitMs`, so the modal stays mounted long enough to play its exit animation
 * (clearing the target immediately would unmount it and the popup would vanish instantly).
 */
export function useDismissibleTarget<T>(exitMs = 220) {
  const [target, setTarget] = useState<T | null>(null)
  const [open, setOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  const clearTimer = useCallback(() => {
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current)
      timer.current = undefined
    }
  }, [])

  const show = useCallback(
    (value: T) => {
      clearTimer()
      setTarget(value)
      setOpen(true)
    },
    [clearTimer],
  )

  const hide = useCallback(() => {
    setOpen(false)
    clearTimer()
    timer.current = window.setTimeout(() => {
      setTarget(null)
      timer.current = undefined
    }, exitMs)
  }, [clearTimer, exitMs])

  useEffect(() => clearTimer, [clearTimer])

  return { target, open, show, hide, setTarget }
}
