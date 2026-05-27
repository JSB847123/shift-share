import { useState } from 'react'
import type { ExcludeDate, PersonExclude, PersonPin, ConflictPair } from '../types'

interface Props {
  names: string[]
  excludeDates: ExcludeDate[]
  personExcludes: PersonExclude[]
  personPins: PersonPin[]
  conflicts: ConflictPair[]
  onExcludeDatesChange: (dates: ExcludeDate[]) => void
  onPersonExcludesChange: (excludes: PersonExclude[]) => void
  onPersonPinsChange: (pins: PersonPin[]) => void
  onConflictsChange: (conflicts: ConflictPair[]) => void
  onPrev: () => void
  onNext: () => void
}

export default function ExcludeStep({
  names,
  excludeDates,
  personExcludes,
  personPins,
  conflicts,
  onExcludeDatesChange,
  onPersonExcludesChange,
  onPersonPinsChange,
  onConflictsChange,
  onPrev,
  onNext,
}: Props) {
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')

  const [peName, setPeName] = useState('')
  const [peDate, setPeDate] = useState('')
  const [peReason, setPeReason] = useState('')

  const [conflictA, setConflictA] = useState('')
  const [conflictB, setConflictB] = useState('')

  const [pinName, setPinName] = useState('')
  const [pinDate, setPinDate] = useState('')
  const [pinReason, setPinReason] = useState('')

  const addExcludeDate = () => {
    if (!date) return
    if (excludeDates.some((e) => e.date === date)) return
    onExcludeDatesChange([...excludeDates, { date, reason: reason.trim() }])
    setDate('')
    setReason('')
  }

  const removeExcludeDate = (dateToRemove: string) => {
    onExcludeDatesChange(excludeDates.filter((e) => e.date !== dateToRemove))
  }

  const addPersonExclude = () => {
    if (!peName || !peDate) return
    if (personExcludes.some((pe) => pe.name === peName && pe.date === peDate)) return
    onPersonExcludesChange([
      ...personExcludes,
      { name: peName, date: peDate, reason: peReason.trim() },
    ])
    setPeDate('')
    setPeReason('')
  }

  const removePersonExclude = (name: string, date: string) => {
    onPersonExcludesChange(
      personExcludes.filter((pe) => !(pe.name === name && pe.date === date)),
    )
  }

  const addPersonPin = () => {
    if (!pinName || !pinDate) return
    if (personPins.some((pp) => pp.name === pinName && pp.date === pinDate)) return
    onPersonPinsChange([
      ...personPins,
      { name: pinName, date: pinDate, reason: pinReason.trim() },
    ])
    setPinDate('')
    setPinReason('')
  }

  const removePersonPin = (name: string, date: string) => {
    onPersonPinsChange(
      personPins.filter((pp) => !(pp.name === name && pp.date === date)),
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addExcludeDate()
    }
  }

  const handlePeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addPersonExclude()
    }
  }

  const handlePinKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addPersonPin()
    }
  }

  return (
    <div className="space-y-6">
      {/* 전체 제외 날짜 */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-lg font-semibold text-white mb-4">전체 제외 날짜</h2>
        <p className="text-sm text-slate-400 mb-4">
          공휴일 등 차출 자체를 하지 않을 날짜 (선택사항)
        </p>

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onKeyDown={handleKeyDown}
            className="bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="사유 (선택)"
            className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={addExcludeDate}
            disabled={!date}
            className={`px-4 py-2.5 rounded-lg font-medium text-sm transition-all cursor-pointer whitespace-nowrap
              ${
                date
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-slate-700 text-slate-500 opacity-50 cursor-not-allowed'
              }`}
          >
            추가
          </button>
        </div>

        {excludeDates.length > 0 ? (
          <div className="space-y-2">
            {[...excludeDates]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((item) => (
                <div
                  key={item.date}
                  className="flex items-center justify-between bg-slate-900/50 rounded-lg px-4 py-2.5 border border-slate-700"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-white font-mono text-sm">{item.date}</span>
                    {item.reason && (
                      <span className="text-slate-400 text-sm">— {item.reason}</span>
                    )}
                  </div>
                  <button
                    onClick={() => removeExcludeDate(item.date)}
                    className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer text-lg"
                  >
                    &times;
                  </button>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-center text-slate-500 py-6">
            제외할 날짜가 없습니다
          </p>
        )}
      </div>

      {/* 개인별 제외 */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-amber-700/50">
        <h2 className="text-lg font-semibold text-white mb-4">개인별 제외 날짜</h2>
        <p className="text-sm text-slate-400 mb-4">
          특정 대상자를 특정 날짜에 차출에서 제외 (휴가, 출장 등)
        </p>

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <select
            value={peName}
            onChange={(e) => setPeName(e.target.value)}
            className="bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="">대상자 선택</option>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={peDate}
            onChange={(e) => setPeDate(e.target.value)}
            onKeyDown={handlePeKeyDown}
            className="bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="text"
            value={peReason}
            onChange={(e) => setPeReason(e.target.value)}
            onKeyDown={handlePeKeyDown}
            placeholder="사유 (선택)"
            className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={addPersonExclude}
            disabled={!peName || !peDate}
            className={`px-4 py-2.5 rounded-lg font-medium text-sm transition-all cursor-pointer whitespace-nowrap
              ${
                peName && peDate
                  ? 'bg-amber-600 text-white hover:bg-amber-700'
                  : 'bg-slate-700 text-slate-500 opacity-50 cursor-not-allowed'
              }`}
          >
            추가
          </button>
        </div>

        {personExcludes.length > 0 ? (
          <div className="space-y-2">
            {[...personExcludes]
              .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
              .map((item) => (
                <div
                  key={`${item.name}-${item.date}`}
                  className="flex items-center justify-between bg-slate-900/50 rounded-lg px-4 py-2.5 border border-slate-700"
                >
                  <div className="flex items-center gap-3">
                    <span className="bg-amber-600/20 text-amber-300 border border-amber-600/30 rounded-full px-2.5 py-0.5 text-sm">
                      {item.name}
                    </span>
                    <span className="text-white font-mono text-sm">{item.date}</span>
                    {item.reason && (
                      <span className="text-slate-400 text-sm">— {item.reason}</span>
                    )}
                  </div>
                  <button
                    onClick={() => removePersonExclude(item.name, item.date)}
                    className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer text-lg"
                  >
                    &times;
                  </button>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-center text-slate-500 py-6">
            개인별 제외 설정이 없습니다
          </p>
        )}
      </div>

      {/* 고정 배정 */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-emerald-700/50">
        <h2 className="text-lg font-semibold text-white mb-4">고정 배정</h2>
        <p className="text-sm text-slate-400 mb-4">
          특정 날짜에 반드시 배정할 대상자를 지정
        </p>

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <select
            value={pinName}
            onChange={(e) => setPinName(e.target.value)}
            className="bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="">대상자 선택</option>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={pinDate}
            onChange={(e) => setPinDate(e.target.value)}
            onKeyDown={handlePinKeyDown}
            className="bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="text"
            value={pinReason}
            onChange={(e) => setPinReason(e.target.value)}
            onKeyDown={handlePinKeyDown}
            placeholder="사유 (선택)"
            className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={addPersonPin}
            disabled={!pinName || !pinDate}
            className={`px-4 py-2.5 rounded-lg font-medium text-sm transition-all cursor-pointer whitespace-nowrap
              ${
                pinName && pinDate
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-slate-700 text-slate-500 opacity-50 cursor-not-allowed'
              }`}
          >
            추가
          </button>
        </div>

        {personPins.length > 0 ? (
          <div className="space-y-2">
            {[...personPins]
              .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
              .map((item) => (
                <div
                  key={`${item.name}-${item.date}`}
                  className="flex items-center justify-between bg-slate-900/50 rounded-lg px-4 py-2.5 border border-slate-700"
                >
                  <div className="flex items-center gap-3">
                    <span className="bg-emerald-600/20 text-emerald-300 border border-emerald-600/30 rounded-full px-2.5 py-0.5 text-sm">
                      {item.name}
                    </span>
                    <span className="text-white font-mono text-sm">{item.date}</span>
                    {item.reason && (
                      <span className="text-slate-400 text-sm">— {item.reason}</span>
                    )}
                  </div>
                  <button
                    onClick={() => removePersonPin(item.name, item.date)}
                    className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer text-lg"
                  >
                    &times;
                  </button>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-center text-slate-500 py-6">
            고정 배정 설정이 없습니다
          </p>
        )}
      </div>

      {/* 상충 조건 */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-rose-700/50">
        <h2 className="text-lg font-semibold text-white mb-2">같이 배정 금지</h2>
        <p className="text-sm text-slate-400 mb-4">
          같은 날 함께 차출되면 안 되는 대상자 조합을 지정
          <br />
          <span className="text-slate-500">2단계에서 대상자를 입력하면 선택이 가능합니다.</span>
        </p>

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <select
            value={conflictA}
            onChange={(e) => setConflictA(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="">대상자 A</option>
            {names.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span className="text-slate-500 self-center text-sm px-1">&harr;</span>
          <select
            value={conflictB}
            onChange={(e) => setConflictB(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="">대상자 B</option>
            {names.filter((n) => n !== conflictA).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <button
            onClick={() => {
              if (!conflictA || !conflictB || conflictA === conflictB) return
              const exists = conflicts.some(
                (c) =>
                  (c.nameA === conflictA && c.nameB === conflictB) ||
                  (c.nameA === conflictB && c.nameB === conflictA),
              )
              if (exists) return
              onConflictsChange([...conflicts, { nameA: conflictA, nameB: conflictB }])
              setConflictA('')
              setConflictB('')
            }}
            disabled={!conflictA || !conflictB || conflictA === conflictB}
            className={`px-4 py-2.5 rounded-lg font-medium text-sm transition-all cursor-pointer whitespace-nowrap
              ${
                conflictA && conflictB && conflictA !== conflictB
                  ? 'bg-rose-600 text-white hover:bg-rose-700'
                  : 'bg-slate-700 text-slate-500 opacity-50 cursor-not-allowed'
              }`}
          >
            추가
          </button>
        </div>

        {conflicts.length > 0 ? (
          <div className="space-y-2">
            {conflicts.map((c) => (
              <div
                key={`${c.nameA}-${c.nameB}`}
                className="flex items-center justify-between bg-slate-900/50 rounded-lg px-4 py-2.5 border border-slate-700"
              >
                <div className="flex items-center gap-2">
                  <span className="bg-rose-600/20 text-rose-300 border border-rose-600/30 rounded-full px-2.5 py-0.5 text-sm">
                    {c.nameA}
                  </span>
                  <span className="text-slate-500 text-sm">&harr;</span>
                  <span className="bg-rose-600/20 text-rose-300 border border-rose-600/30 rounded-full px-2.5 py-0.5 text-sm">
                    {c.nameB}
                  </span>
                </div>
                <button
                  onClick={() =>
                    onConflictsChange(
                      conflicts.filter(
                        (x) => !(x.nameA === c.nameA && x.nameB === c.nameB),
                      ),
                    )
                  }
                  className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer text-lg"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-slate-500 py-4">
            설정된 조합이 없습니다
          </p>
        )}
      </div>

      <div className="flex justify-between">
        <button
          onClick={onPrev}
          className="px-6 py-2.5 rounded-lg font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition-all cursor-pointer"
        >
          ← 이전
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2.5 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
        >
          편성표 생성 →
        </button>
      </div>
    </div>
  )
}
