import { useState } from 'react'
import type { ScheduleResult } from '../types'
import { downloadCSV, copyToClipboard } from '../utils/exportUtils'

interface Props {
  result: ScheduleResult
  onRegenerate: () => void
  onReset: () => void
  onPrev: () => void
}

export default function ResultStep({ result, onRegenerate, onReset, onPrev }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await copyToClipboard(result.assignments)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const first = result.assignments[0]?.date ?? 'schedule'
    const last = result.assignments[result.assignments.length - 1]?.date ?? ''
    downloadCSV(result.assignments, `차출편성표_${first}_${last}.csv`)
  }

  const mainStatsEntries = Object.entries(result.mainStats).sort((a, b) => b[1] - a[1])
  const hasSeparate = result.separateStats.length > 0

  return (
    <div className="space-y-6">
      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onRegenerate}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-all cursor-pointer"
        >
          재배정
        </button>
        <button
          onClick={handleDownload}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-all cursor-pointer"
        >
          CSV 다운로드
        </button>
        <button
          onClick={handleCopy}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 transition-all cursor-pointer"
        >
          {copied ? '복사 완료!' : '클립보드 복사'}
        </button>
        <button
          onClick={onReset}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600/80 text-white hover:bg-red-600 transition-all cursor-pointer ml-auto"
        >
          처음부터 다시
        </button>
      </div>

      {/* Schedule table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
        <h2 className="text-lg font-semibold text-white p-4 pb-0">편성표</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">날짜</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium w-16">요일</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">차출 인원</th>
                {hasSeparate && (
                  <th className="text-center px-4 py-3 text-slate-400 font-medium w-20">구분</th>
                )}
              </tr>
            </thead>
            <tbody>
              {result.assignments.map((a, i) => (
                  <tr
                    key={a.date}
                    className={`border-b border-slate-700/50 ${
                      a.rotationId
                        ? 'bg-violet-950/30'
                        : i % 2 === 0
                          ? 'bg-slate-800/30'
                          : 'bg-slate-900/30'
                    }`}
                  >
                    <td className="px-4 py-2.5 text-white font-mono">{a.date}</td>
                    <td
                      className={`px-4 py-2.5 text-center font-medium ${
                        a.dayIndex === 0
                          ? 'text-red-400'
                          : a.dayIndex === 6
                            ? 'text-blue-400'
                            : 'text-slate-300'
                      }`}
                    >
                      {a.dayOfWeek}
                    </td>
                    <td className="px-4 py-2.5 text-slate-200">{a.names.join(', ')}</td>
                    {hasSeparate && (
                      <td className="px-4 py-2.5 text-center">
                        {a.rotationId ? (
                          <span className="bg-violet-600/20 text-violet-300 border border-violet-600/30 rounded-full px-2 py-0.5 text-xs">
                            별도
                          </span>
                        ) : (
                          <span className="text-slate-500 text-xs">기본</span>
                        )}
                      </td>
                    )}
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Main Stats */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
        <h2 className="text-lg font-semibold text-white mb-3">
          {hasSeparate ? '기본 순번 통계' : '배정 통계'}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {mainStatsEntries.map(([name, count]) => (
            <div
              key={name}
              className="bg-slate-900/50 rounded-lg p-3 border border-slate-700 text-center"
            >
              <div className="text-white font-medium text-sm">{name}</div>
              <div className="text-2xl font-bold text-blue-400 mt-1">{count}</div>
              <div className="text-xs text-slate-500">회</div>
            </div>
          ))}
        </div>
      </div>

      {/* Separate rotation stats */}
      {result.separateStats.map((rs, idx) => {
        const entries = Object.entries(rs.stats).sort((a, b) => b[1] - a[1])
        return (
          <div key={idx} className="bg-slate-800/50 rounded-xl p-4 border border-violet-700/50">
            <h2 className="text-lg font-semibold text-white mb-3">
              별도 순번 통계 — {rs.label}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {entries.map(([name, count]) => (
                <div
                  key={name}
                  className="bg-slate-900/50 rounded-lg p-3 border border-violet-700/30 text-center"
                >
                  <div className="text-white font-medium text-sm">{name}</div>
                  <div className="text-2xl font-bold text-violet-400 mt-1">{count}</div>
                  <div className="text-xs text-slate-500">회</div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* Excluded dates */}
      {result.excludedDates.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
          <h2 className="text-lg font-semibold text-white mb-3">전체 제외 날짜</h2>
          <div className="space-y-1.5">
            {result.excludedDates.map((e) => (
              <div key={e.date} className="text-sm text-slate-400">
                <span className="font-mono text-slate-300">{e.date}</span>
                {e.reason && <span> — {e.reason}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Person excludes */}
      {result.personExcludes.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-4 border border-amber-700/50">
          <h2 className="text-lg font-semibold text-white mb-3">개인별 제외</h2>
          <div className="space-y-1.5">
            {result.personExcludes.map((pe) => (
              <div key={`${pe.name}-${pe.date}`} className="text-sm text-slate-400 flex items-center gap-2">
                <span className="bg-amber-600/20 text-amber-300 border border-amber-600/30 rounded-full px-2 py-0.5 text-xs">
                  {pe.name}
                </span>
                <span className="font-mono text-slate-300">{pe.date}</span>
                {pe.reason && <span>— {pe.reason}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Person pins */}
      {result.personPins.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-4 border border-emerald-700/50">
          <h2 className="text-lg font-semibold text-white mb-3">고정 배정</h2>
          <div className="space-y-1.5">
            {result.personPins.map((pp) => (
              <div key={`${pp.name}-${pp.date}`} className="text-sm text-slate-400 flex items-center gap-2">
                <span className="bg-emerald-600/20 text-emerald-300 border border-emerald-600/30 rounded-full px-2 py-0.5 text-xs">
                  {pp.name}
                </span>
                <span className="font-mono text-slate-300">{pp.date}</span>
                {pp.reason && <span>— {pp.reason}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-start">
        <button
          onClick={onPrev}
          className="px-6 py-2.5 rounded-lg font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition-all cursor-pointer"
        >
          ← 이전
        </button>
      </div>
    </div>
  )
}
