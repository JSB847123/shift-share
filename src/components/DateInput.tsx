import { useState, useRef, useEffect } from 'react'

interface DateInputProps {
  value: string
  onChange: (value: string) => void
  onKeyDown?: (e: React.KeyboardEvent) => void
  className?: string
}

export default function DateInput({ value, onChange, onKeyDown, className = '' }: DateInputProps) {
  const [display, setDisplay] = useState(value)
  const [editing, setEditing] = useState(false)
  const dateRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) {
      setDisplay(value)
    }
  }, [value, editing])

  const formatDigits = (digits: string): string => {
    if (digits.length <= 4) return digits
    if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
    const formatted = formatDigits(digits)
    setDisplay(formatted)
    if (digits.length === 8) {
      onChange(formatted)
    } else if (digits.length === 0) {
      onChange('')
    }
  }

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setEditing(true)
    e.target.select()
  }

  const handleBlur = () => {
    setEditing(false)
    const digits = display.replace(/\D/g, '')
    if (digits.length !== 8 && digits.length !== 0) {
      setDisplay(value)
    }
  }

  const handleCalendarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    onChange(val)
    setDisplay(val)
    setEditing(false)
  }

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={onKeyDown}
        placeholder="YYYY-MM-DD"
        className={className}
        style={{ paddingRight: '2.25rem' }}
      />
      <button
        type="button"
        onClick={() => dateRef.current?.showPicker()}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors cursor-pointer"
        tabIndex={-1}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 9v9.75" />
        </svg>
      </button>
      <input
        ref={dateRef}
        type="date"
        value={value}
        onChange={handleCalendarChange}
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}
      />
    </div>
  )
}
