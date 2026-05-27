import { useState } from 'react'

interface Props {
  names: string[]
  onNamesChange: (names: string[]) => void
  useOrder: boolean
  onUseOrderChange: (v: boolean) => void
  onPrev: () => void
  onNext: () => void
}

export default function NamesStep({ names, onNamesChange, useOrder, onUseOrderChange, onPrev, onNext }: Props) {
  const [input, setInput] = useState('')

  const addNames = () => {
    const newNames = input
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n && !names.includes(n))

    if (newNames.length > 0) {
      onNamesChange([...names, ...newNames])
    }
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addNames()
    }
  }

  const removeName = (name: string) => {
    onNamesChange(names.filter((n) => n !== name))
  }

  const moveUp = (index: number) => {
    if (index === 0) return
    const newNames = [...names]
    ;[newNames[index - 1], newNames[index]] = [newNames[index], newNames[index - 1]]
    onNamesChange(newNames)
  }

  const moveDown = (index: number) => {
    if (index === names.length - 1) return
    const newNames = [...names]
    ;[newNames[index], newNames[index + 1]] = [newNames[index + 1], newNames[index]]
    onNamesChange(newNames)
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">대상 인원</h2>
          <span className="text-sm text-slate-400 bg-slate-700 px-3 py-1 rounded-full">
            총 {names.length}명
          </span>
        </div>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="이름 입력 (쉼표로 구분하여 여러 명 입력 가능)"
            className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={addNames}
            disabled={!input.trim()}
            className={`px-4 py-2.5 rounded-lg font-medium text-sm transition-all cursor-pointer whitespace-nowrap
              ${
                input.trim()
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-slate-700 text-slate-500 opacity-50 cursor-not-allowed'
              }`}
          >
            추가
          </button>
        </div>

        {names.length > 0 ? (
          useOrder ? (
            <div className="space-y-1.5">
              {names.map((name, index) => (
                <div
                  key={name}
                  className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700"
                >
                  <span className="w-8 text-center text-sm font-mono text-blue-400 font-bold shrink-0">
                    {index + 1}
                  </span>
                  <span className="flex-1 text-white text-sm">{name}</span>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => moveUp(index)}
                      disabled={index === 0}
                      className={`w-7 h-7 rounded flex items-center justify-center text-xs transition-colors cursor-pointer
                        ${index === 0 ? 'text-slate-600' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveDown(index)}
                      disabled={index === names.length - 1}
                      className={`w-7 h-7 rounded flex items-center justify-center text-xs transition-colors cursor-pointer
                        ${index === names.length - 1 ? 'text-slate-600' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                    >
                      ▼
                    </button>
                  </div>
                  <button
                    onClick={() => removeName(name)}
                    className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer ml-1 shrink-0"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {names.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1.5 bg-blue-600/20 text-blue-300 border border-blue-600/30 rounded-full px-3 py-1.5 text-sm"
                >
                  {name}
                  <button
                    onClick={() => removeName(name)}
                    className="text-blue-400 hover:text-red-400 transition-colors cursor-pointer ml-0.5"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )
        ) : (
          <p className="text-center text-slate-500 py-8">
            차출 대상 인원을 추가해주세요
          </p>
        )}

        {/* 순번 설정 */}
        {names.length > 0 && (
          <label className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={useOrder}
              onChange={(e) => onUseOrderChange(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
            />
            <div>
              <span className="text-sm text-slate-300">순번 적용</span>
              <span className="text-xs text-slate-500 ml-2">
                활성화하면 위 순서대로 우선 차출됩니다
              </span>
            </div>
          </label>
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
          disabled={names.length === 0}
          className={`px-6 py-2.5 rounded-lg font-medium transition-all cursor-pointer
            ${
              names.length > 0
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
