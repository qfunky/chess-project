const BASE = (typeof window !== 'undefined' && window.__BASE__) || '';

async function postJson(path, body) {
    const r = await fetch(BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
    return r.json();
}

export const analyze   = (fen, skill) => postJson('/api/analyze', { fen, skill_level: skill });
export const hint      = (fen)        => postJson('/api/hint',    { fen });
export const review    = (fens)       => postJson('/api/review',  { fens });
export const saveGame  = (payload)    => postJson('/games/save',  payload).catch(() => null);
export const deleteGame = async (id) => {
    const r = await fetch(BASE + '/games/' + id, { method: 'DELETE' });
    return r.ok;
};
