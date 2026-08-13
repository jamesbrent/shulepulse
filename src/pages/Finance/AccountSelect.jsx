import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

// Portaled custom dropdown for account pickers inside modals.
// The options list renders on <body> with fixed positioning, so it is never
// clipped by the modal and cannot change the modal's size or position. It
// opens upward when there is not enough space below the trigger.
const MENU_MAX_HEIGHT = 260
const GAP = 4

export default function AccountSelect({ value, onChange, options = [], placeholder = 'Select account' }) {
  const listId = useId()
  const triggerRef = useRef(null)
  const listRef = useRef(null)
  const itemRefs = useRef([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [pos, setPos] = useState(null)

  const selected = options.find((o) => o.id === value) || null

  const close = useCallback(() => {
    setOpen(false)
    setActive(-1)
  }, [])

  const openMenu = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom - GAP
    const spaceAbove = r.top - GAP
    const up = spaceBelow < MENU_MAX_HEIGHT && spaceAbove > spaceBelow
    setPos({
      top: up ? undefined : r.bottom + GAP,
      bottom: up ? window.innerHeight - r.top + GAP : undefined,
      left: r.left,
      width: r.width,
      maxHeight: Math.max(120, Math.min(MENU_MAX_HEIGHT, up ? spaceAbove : spaceBelow)),
    })
    setActive(options.findIndex((o) => o.id === value))
    setOpen(true)
  }, [options, value])

  // Outside click + reposition safety when the viewport changes.
  useEffect(() => {
    if (!open) return
    const onMouseDown = (e) => {
      if (listRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return
      close()
    }
    const onScroll = () => close()
    const onResize = () => close()
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open, close])

  // Keep the active item visible while keyboard-navigating.
  useEffect(() => {
    if (open && active >= 0 && itemRefs.current[active]) {
      itemRefs.current[active].scrollIntoView({ block: 'nearest' })
    }
  }, [active, open])

  const select = (id) => {
    onChange(id)
    close()
    triggerRef.current?.focus()
  }

  const onTriggerKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openMenu()
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActive((i) => (options.length === 0 ? -1 : (i + 1) % options.length))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive((i) => (options.length === 0 ? -1 : (i - 1 + options.length) % options.length))
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (active >= 0 && options[active]) select(options[active].id)
        break
      case 'Escape':
        e.preventDefault()
        close()
        triggerRef.current?.focus()
        break
      case 'Tab':
        close()
        break
      default:
    }
  }

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={`as-accsel${open ? ' as-accsel-open' : ''}`}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-opt-${active}` : undefined}
      >
        <span className={selected ? 'as-accsel-text' : 'as-accsel-text as-accsel-ph'}>
          {selected ? `${selected.code} — ${selected.name}` : placeholder}
        </span>
        <ChevronDown size={15} className="as-accsel-caret" />
      </button>
      {open && createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="as-accsel-menu"
          style={{ ...pos, zIndex: 2000 }}
        >
          {options.length === 0 ? (
            <li className="as-accsel-empty">No accounts available</li>
          ) : options.map((o, i) => (
            <li
              key={o.id}
              ref={(el) => { itemRefs.current[i] = el }}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={o.id === value}
              className={`as-accsel-opt${i === active ? ' as-accsel-active' : ''}${o.id === value ? ' as-accsel-selected' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); select(o.id) }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="as-accsel-code">{o.code}</span>
              <span className="as-accsel-name">{o.name}</span>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  )
}
