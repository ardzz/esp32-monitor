import React, { useEffect } from 'react'

export default function Alert({ message, type = 'info', onClose }) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => {
      onClose && onClose()
    }, 5000)
    return () => clearTimeout(t)
  }, [message, onClose])

  if (!message) return null

  const baseClasses = 'fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow border flex items-start gap-2'
  let colorClasses = 'bg-blue-100 border-blue-200 text-blue-800'
  if (type === 'error') colorClasses = 'bg-red-100 border-red-200 text-red-800'
  if (type === 'success') colorClasses = 'bg-green-100 border-green-200 text-green-800'

  return (
    <div className={`${baseClasses} ${colorClasses}`}>
      <span className="flex-1">{message}</span>
      <button className="ml-2" onClick={onClose} aria-label="Close">
        &times;
      </button>
    </div>
  )
}
