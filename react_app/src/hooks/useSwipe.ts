import { TouchEvent, useState } from 'react'

interface SwipeInput {
  onSwipedLeft?: () => void
  onSwipedRight?: () => void
  onSwipedUp?: () => void
  onSwipedDown?: () => void
}

interface SwipeOutput {
  onTouchStart: (e: TouchEvent) => void
  onTouchMove: (e: TouchEvent) => void
  onTouchEnd: () => void
}

const MIN_SWIPE_DISTANCE = 50

export default function useSwipe({
  onSwipedLeft,
  onSwipedRight,
  onSwipedUp,
  onSwipedDown,
}: SwipeInput): SwipeOutput {
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null)
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(null)

  const onTouchStart = (e: TouchEvent) => {
    setTouchEnd(null)
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    })
  }

  const onTouchMove = (e: TouchEvent) => {
    setTouchEnd({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    })
  }

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return

    const distanceX = touchStart.x - touchEnd.x
    const distanceY = touchStart.y - touchEnd.y
    const isLeftSwipe = distanceX > MIN_SWIPE_DISTANCE
    const isRightSwipe = distanceX < -MIN_SWIPE_DISTANCE
    const isUpSwipe = distanceY > MIN_SWIPE_DISTANCE
    const isDownSwipe = distanceY < -MIN_SWIPE_DISTANCE

    if (Math.abs(distanceX) > Math.abs(distanceY)) {
      // Horizontal swipe
      if (isLeftSwipe && onSwipedLeft) {
        onSwipedLeft()
      }
      if (isRightSwipe && onSwipedRight) {
        onSwipedRight()
      }
    } else {
      // Vertical swipe
      if (isUpSwipe && onSwipedUp) {
        onSwipedUp()
      }
      if (isDownSwipe && onSwipedDown) {
        onSwipedDown()
      }
    }
  }

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  }
}
