import { useStores, withCurrent } from '../../api/stores'

// <option> list for store <select>s — reads the managed store list (Settings → Stores).
// `current` keeps an archived value selectable when editing an existing record;
// `all` includes archived stores (history filters).
export default function StoreOptions({ current, all }: { current?: string | null; all?: boolean }) {
  const { names } = useStores({ all })
  return (
    <>
      {withCurrent(names, current).map((s) => <option key={s} value={s}>{s}</option>)}
    </>
  )
}
