/** Placeholder shapes that mirror the real cards, so layout never jumps. */

export function CardSkeleton({ withAside = false }: { withAside?: boolean }) {
  return (
    <div className="sk-card" aria-hidden="true">
      <div className="sk sk-line" style={{ width: '28%', height: 9 }} />
      <div className="sk sk-title" style={{ width: '92%' }} />
      <div className="sk sk-title" style={{ width: '64%' }} />
      <div className="card-body" style={{ marginTop: 6 }}>
        <div>
          <div className="sk sk-line" style={{ width: '96%' }} />
          <div className="sk sk-line" style={{ width: '88%' }} />
          <div className="sk sk-line" style={{ width: '52%' }} />
        </div>
        {withAside && <div className="sk" style={{ width: 64, height: 64, flex: 'none', borderRadius: 10 }} />}
      </div>
      <div className="actions" style={{ marginTop: 6 }}>
        <div className="sk" style={{ width: 104, height: 30, borderRadius: 10 }} />
        <div className="sk" style={{ width: 132, height: 30, borderRadius: 10 }} />
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 3, withAside = false, label = 'Loading' }: { count?: number; withAside?: boolean; label?: string }) {
  return (
    <div className="list" role="status" aria-label={label} aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} withAside={withAside} />
      ))}
    </div>
  );
}

export function ContextSkeleton() {
  return (
    <div className="context-bar" aria-hidden="true">
      <div className="sk sk-line" style={{ width: 74, height: 9 }} />
      <div className="sk sk-title" style={{ width: '80%', marginTop: 8 }} />
      <div className="sk sk-line" style={{ width: '34%' }} />
    </div>
  );
}
