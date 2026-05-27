import { useState } from 'react'
import type { SeparateRotation } from '../types'

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

interface Props {
  startDate: string
  endDate: string
  weekdayOnly: boolean
  perDay: number
  separateRotations: SeparateRotation[]
  onStartDateChange: (v: string) => void
  onEndDateChange: (v: string) => void
  onWeekdayOnlyChange: (v: boolean) => void
  onPerDayChange: (v: number) => void
  onSeparateRotationsChange: (v: SeparateRotation[]) => void
  onNext: () => void
}

export default function PeriodStep({
  startDate,
  endDate,
  weekdayOnly,
  perDay,
  separateRotations,
  onStartDateChange,
  onEndDateChange,
  onWeekdayOnlyChange,
  onPerDayChange,
  onSeparateRotationsChange,
  onNext,
}: Props) {
  const [rotType, setRotType] = useState<'day-of-week' | 'day-of-month'>('day-of-week')
  const [rotValue, setRotValue] = useState(5) // default: 금요일
  const [rotPerDay, setRotPerDay] = useState(1)

  const isValid = startDate && endDate && startDate <= endDate

  const addRotation = () => {
    // Check for duplicate
    if (separateRotations.some((r) => r.type === rotType && r.value === rotValue)) return

    const label =
      rotType === 'day-of-week'
        ? `매주 ${DAY_NAMES[rotValue]}요일`
        : `매달 ${rotValue}일`

    const id = `${rotType}-${rotValue}`

    onSeparateRotationsChange([
      ...separateRotations,
      { id, label, type: rotType, value: rotValue, perDay: rotPerDay },
    ])
  }

  const removeRotation = (id: string) => {
    onSeparateRotationsChange(separateRotations.filter((r) => r.id !== id))
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-lg font-semibold text-white mb-4">차출 기간</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">시작일</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">종료일</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 mt-4 cursor-pointer">
          <input
            type="checkbox"
            checked={weekdayOnly}
            onChange={(e) => onWeekdayOnlyChange(e.target.checked)}
            className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
          />
          <span className="text-sm text-slate-300">평일만 배정 (토·일 제외)</span>
        </label>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-lg font-semibold text-white mb-4">기본 1회 차출 인원 수</h2>
        <div className="flex gap-3">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              onClick={() => onPerDayChange(n)}
              className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-all cursor-pointer
                ${
                  perDay === n
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'bg-slate-900 text-slate-400 border border-slate-600 hover:border-slate-500'
                }`}
            >
              {n}명
            </button>
          ))}
        </div>
      </div>

      {/* 별도 순번 */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-violet-700/50">
        <h2 className="text-lg font-semibold text-white mb-2">별도 순번</h2>
        <p className="text-sm text-slate-400 mb-4">
          특정 요일이나 매달 특정일에 별도의 순번을 적용 (선택사항)
        </p>

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <select
            value={rotType}
            onChange={(e) => setRotType(e.target.value as 'day-of-week' | 'day-of-month')}
            className="bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="day-of-week">매주 요일</option>
            <option value="day-of-month">매달 일자</option>
          </select>

          {rotType === 'day-of-week' ? (
            <select
              value={rotValue}
              onChange={(e) => setRotValue(Number(e.target.value))}
              className="bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {DAY_NAMES.map((name, i) => (
                <option key={i} value={i}>
                  {name}요일
                </option>
              ))}
            </select>
          ) : (
            <select
              value={rotValue}
              onChange={(e) => setRotValue(Number(e.target.value))}
              className="bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}일
                </option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400 whitespace-nowrap">인원</span>
            <select
              value={rotPerDay}
              onChange={(e) => setRotPerDay(Number(e.target.value))}
              className="bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}명
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={addRotation}
            className="px-4 py-2.5 rounded-lg font-medium text-sm transition-all cursor-pointer whitespace-nowrap bg-violet-600 text-white hover:bg-violet-700"
          >
            추가
          </button>
        </div>

        {separateRotations.length > 0 ? (
          <div className="space-y-2">
            {separateRotations.map((rot) => (
              <div
                key={rot.id}
                className="flex items-center justify-between bg-slate-900/50 rounded-lg px-4 py-2.5 border border-slate-700"
              >
                <div className="flex items-center gap-3">
                  <span className="bg-violet-600/20 text-violet-300 border border-violet-600/30 rounded-full px-2.5 py-0.5 text-sm">
                    {rot.label}
                  </span>
                  <span className="text-slate-400 text-sm">{rot.perDay}명</span>
                </div>
                <button
                  onClick={() => removeRotation(rot.id)}
                  className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer text-lg"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-slate-500 py-4">
            별도 순번이 없으면 모든 날짜에 동일한 순번이 적용됩니다
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={!isValid}
          className={`px-6 py-2.5 rounded-lg font-medium transition-all cursor-pointer
            ${
              isValid
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/30'
                : 'bg-slate-700 text-slate-500 opacity-50 cursor-not-allowed'
            }`}
        >
          다음 단계 →
        </button>
      </div>
    </div>
  )
}
