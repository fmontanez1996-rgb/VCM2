const { useEffect, useMemo, useRef, useState } = React;

const GROUPS = [
    { id: 'cantantes', label: 'Cantantes', singular: 'Cantante', emoji: '🎤', color: '#2563eb', button: 'from-blue-400 via-blue-600 to-blue-900', border: 'border-blue-400', glow: 'shadow-blue-950/70' },
    { id: 'actrices', label: 'Actrices', singular: 'Actriz', emoji: '🎬', color: '#16a34a', button: 'from-green-400 via-green-600 to-green-900', border: 'border-green-400', glow: 'shadow-green-950/70' },
    { id: 'nsfw', label: 'NSFW', singular: 'NSFW', emoji: '🔥', color: '#dc2626', button: 'from-red-400 via-red-600 to-red-950', border: 'border-red-400', glow: 'shadow-red-950/70' },
    { id: 'otros', label: 'Otros', singular: 'Otro', emoji: '⭐', color: '#ca8a04', button: 'from-yellow-300 via-yellow-500 to-yellow-800', border: 'border-yellow-300', glow: 'shadow-yellow-950/70' },
];

const EMPTY_FORM = {
    name: '', birthDate: '', country: '', city: '', height: '', photo: '', group: 'cantantes'
};

const STORAGE_KEY = 'supereliteg2-state-v1';
const DEFAULT_BATTLE_TAGS = ['Facciones', 'Ojos', 'Boca', 'Cabello', 'Cintura', 'Cola', 'Pechos', 'Piernas', 'Cuerpo', 'Talento', 'Carisma', 'Elegancia', 'Sensualidad', 'Dulzura', 'Altura'];
const DATA_URL = 'characters.json';
const MEDIA_DATA_URL = 'media.json';
const RATINGS_DATA_URL = 'calificaciones.json';
const CHARACTERS_API_URL = '/api/characters';

const RATING_TAGS = [
    { id: 'facciones', label: 'Facciones' },
    { id: 'ojos', label: 'Ojos' },
    { id: 'boca', label: 'Boca' },
    { id: 'cabello', label: 'Cabello' },
    { id: 'cuerpo', label: 'Cuerpo' },
    { id: 'cintura', label: 'Cintura' },
    { id: 'pechos', label: 'Pechos' },
    { id: 'cola', label: 'Cola' },
    { id: 'piernas', label: 'Piernas' },
    { id: 'altura', label: 'Altura' },
    { id: 'elegancia', label: 'Elegancia', aliases: ['Elgancia'] },
    { id: 'talento', label: 'Talento' },
    { id: 'carisma', label: 'Carisma' },
    { id: 'dulzura', label: 'Dulzura' },
    { id: 'sensualidad', label: 'Sensualidad' },
];

const RATING_GROUPS = [
    { id: 'rostro', label: 'Grupo Rostro', tags: ['facciones', 'ojos', 'boca', 'cabello'] },
    { id: 'fisico', label: 'Grupo Físico', tags: ['cuerpo', 'cintura', 'pechos', 'cola', 'piernas', 'altura'] },
    { id: 'actitud', label: 'Grupo Actitud', tags: ['elegancia', 'talento', 'carisma', 'dulzura', 'sensualidad'] },
];

const RANKING_OPTIONS = [
    { type: 'general', id: 'general', label: 'Puntaje general' },
    ...RATING_GROUPS.map(group => ({ type: 'group', id: group.id, label: group.label })),
    ...RATING_TAGS.map(tag => ({ type: 'tag', id: tag.id, label: tag.label })),
];
const fallbackPhoto = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#334155"/><stop offset="1" stop-color="#020617"/></linearGradient></defs>
        <rect width="500" height="500" fill="url(#g)"/><circle cx="250" cy="180" r="82" fill="#94a3b8"/><path d="M95 440c22-96 84-148 155-148s133 52 155 148" fill="#64748b"/>
    </svg>
`);

const todayISO = () => new Date().toISOString().slice(0, 10);
const getGroup = (id) => GROUPS.find(group => group.id === id) || GROUPS[0];
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const isGifSource = (src = '') => /^data:image\/gif/i.test(src) || /\.gif(?:[?#]|$)/i.test(src);
const normalizeMediaType = (type, src = '') => isGifSource(src) ? 'gif' : (type === 'video' ? 'video' : 'image');

function calculateAge(dateString) {
    if (!dateString) return '';
    const birth = new Date(`${dateString}T00:00:00`);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDelta = today.getMonth() - birth.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) age -= 1;
    return Number.isFinite(age) && age >= 0 ? age : '';
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function normalizeCharacter(character) {
    return {
        ...EMPTY_FORM,
        ...character,
        group: character.group === 'actriz' ? 'actrices' : character.group,
        id: character.id || uid(),
    };
}

function mergeCharacters(jsonCharacters, storedCharacters) {
    const merged = new Map();
    jsonCharacters.map(normalizeCharacter).forEach(character => merged.set(character.id, character));
    storedCharacters.map(normalizeCharacter).forEach(character => merged.set(character.id, character));
    return Array.from(merged.values());
}

async function loadCharactersFromJson() {
    const response = await fetch(DATA_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`No se pudo cargar ${DATA_URL}: ${response.status}`);
    const data = await response.json();
    return Array.isArray(data.characters) ? data.characters : [];
}

async function loadRatingsFromJson() {
    try {
        const response = await fetch(RATINGS_DATA_URL, { cache: 'no-store' });
        if (!response.ok) return {};
        const data = await response.json();
        return data && typeof data === 'object' ? data : {};
    } catch (error) {
        console.warn('No se pudo cargar calificaciones.json.', error);
        return {};
    }
}

function normalizeRatingKey(key = '') {
    return String(key).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeRatingValue(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return 0;
    return Math.min(Math.max(numericValue, 0), 100);
}

function getRatingTag(tagId) {
    return RATING_TAGS.find(tag => tag.id === tagId);
}

function getRatingGroup(groupId) {
    return RATING_GROUPS.find(group => group.id === groupId);
}

function getRatingValue(ratingSet = {}, tagId) {
    const tag = getRatingTag(tagId);
    if (!tag) return 0;

    const normalizedCandidates = [tag.id, tag.label, ...(tag.aliases || [])].map(normalizeRatingKey);
    const matchingKey = Object.keys(ratingSet).find(key => normalizedCandidates.includes(normalizeRatingKey(key)));
    return matchingKey ? normalizeRatingValue(ratingSet[matchingKey]) : 0;
}

function getGroupRatingAverage(ratingSet = {}, groupId) {
    const group = getRatingGroup(groupId);
    if (!group) return 0;
    const total = group.tags.reduce((sum, tagId) => sum + getRatingValue(ratingSet, tagId), 0);
    return total / group.tags.length;
}

function getGeneralRating(ratingSet = {}) {
    const total = RATING_GROUPS.reduce((sum, group) => sum + getGroupRatingAverage(ratingSet, group.id), 0);
    return total / RATING_GROUPS.length;
}

function getCharacterRating(character, ratings) {
    const ratingSet = ratings[character.id] || {};
    const groups = RATING_GROUPS.reduce((result, group) => ({
        ...result,
        [group.id]: getGroupRatingAverage(ratingSet, group.id),
    }), {});
    const tags = RATING_TAGS.reduce((result, tag) => ({
        ...result,
        [tag.id]: getRatingValue(ratingSet, tag.id),
    }), {});
    return { average: getGeneralRating(ratingSet), groups, tags, categories: ratingSet };
}

function getRankingScoreForOption(rating, option) {
    if (option.type === 'tag') return rating.tags[option.id] || 0;
    if (option.type === 'group') return rating.groups[option.id] || 0;
    return rating.average || 0;
}

function getBattleTags(ratings = {}) {
    const tags = new Set(DEFAULT_BATTLE_TAGS);
    Object.values(ratings).forEach(ratingSet => {
        if (!ratingSet || typeof ratingSet !== 'object') return;
        Object.entries(ratingSet).forEach(([tag, value]) => {
            if (typeof value === 'number' && Number.isFinite(value)) tags.add(tag);
        });
    });
    return Array.from(tags);
}

function getBattlePairKey(firstId, secondId) {
    return [firstId, secondId].sort().join('::');
}

function hasBattleResult(battleResults, tag, firstId, secondId) {
    const pairKey = getBattlePairKey(firstId, secondId);
    return battleResults.some(result => result.tag === tag && result.pairKey === pairKey);
}

async function loadMediaFromJson() {
    try {
        const response = await fetch(MEDIA_DATA_URL, { cache: 'no-store' });
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data.media) ? data.media : [];
    } catch (error) {
        console.warn('No se pudo cargar media.json, se usará solo localStorage.', error);
        return [];
    }
}

function mergeMedia(jsonMedia, storedMedia) {
    const merged = new Map();
    jsonMedia.forEach(item => {
        if (item.id) merged.set(item.id, item);
    });
    storedMedia.forEach(item => {
        if (item.id) merged.set(item.id, item);
    });
    return Array.from(merged.values());
}

async function saveCharactersToJson(characters) {
    const response = await fetch(CHARACTERS_API_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characters }),
    });

    if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `No se pudo actualizar ${DATA_URL}: ${response.status}`);
    }

    return response.json();
}

function App() {
    const [view, setView] = useState({ page: 'characters' });
    const [characters, setCharacters] = useState([]);
    const [media, setMedia] = useState([]);
    const [ratings, setRatings] = useState({});
    const [battleResults, setBattleResults] = useState([]);
    const [characterModal, setCharacterModal] = useState(null);
    const [mediaModal, setMediaModal] = useState(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [persistenceStatus, setPersistenceStatus] = useState('');
    const [player, setPlayer] = useState(null);
    const [playbackSettings, setPlaybackSettings] = useState({ interval: 5, shuffle: false });

    useEffect(() => {
        let isMounted = true;

        async function loadInitialState() {
            let jsonCharacters = [];
            let jsonMedia = [];
            let jsonRatings = {};
            let storedCharacters = [];
            let storedMedia = [];
            let storedBattleResults = [];

            try {
                jsonCharacters = await loadCharactersFromJson();
            } catch (error) {
                console.error(error);
                setLoadError('No se pudo leer characters.json. Abre la página desde un servidor local para permitir la carga del JSON.');
            }

            try {
                jsonMedia = await loadMediaFromJson();
            } catch (error) {
                console.error(error);
            }

            try {
                jsonRatings = await loadRatingsFromJson();
            } catch (error) {
                console.error(error);
            }

            try {
                const stored = localStorage.getItem(STORAGE_KEY);
                if (stored) {
                    const parsed = JSON.parse(stored);
                    storedCharacters = parsed.characters || [];
                    storedMedia = parsed.media || [];
                    storedBattleResults = Array.isArray(parsed.battleResults) ? parsed.battleResults : [];
                }
            } catch (error) {
                console.error('No se pudo leer localStorage:', error);
            }

            if (!isMounted) return;
            setCharacters(mergeCharacters(jsonCharacters, storedCharacters));
            setMedia(mergeMedia(jsonMedia, storedMedia));
            setRatings(jsonRatings);
            setBattleResults(storedBattleResults);
            setIsLoaded(true);
        }

        loadInitialState();
        return () => { isMounted = false; };
    }, []);

    useEffect(() => {
        if (!isLoaded) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ media, battleResults }));
    }, [media, battleResults, isLoaded]);

    const selectedGroup = view.groupId ? getGroup(view.groupId) : null;
    const selectedCharacter = view.characterId ? characters.find(character => character.id === view.characterId) : null;
    const groupCharacters = selectedGroup ? characters.filter(character => character.group === selectedGroup.id) : [];
    const selectedCharacterMedia = selectedCharacter ? media.filter(item => item.characterId === selectedCharacter.id) : [];
    const mediaWithCharacters = useMemo(() => media.map(item => ({ ...item, type: normalizeMediaType(item.type, item.src), character: characters.find(character => character.id === item.characterId) })).filter(item => item.character), [media, characters]);
    const mediaCountByCharacter = useMemo(() => media.reduce((counts, item) => ({ ...counts, [item.characterId]: (counts[item.characterId] || 0) + 1 }), {}), [media]);

    const navigate = (nextView) => setView(nextView);

    const persistCharacters = async (nextCharacters) => {
        setPersistenceStatus('Guardando cambios en characters.json...');
        try {
            await saveCharactersToJson(nextCharacters);
            setPersistenceStatus('✅ characters.json actualizado automáticamente.');
        } catch (error) {
            console.error(error);
            setPersistenceStatus('⚠️ Cambio guardado en pantalla, pero no se pudo escribir characters.json. Inicia la app con `node server.js`.');
        }
    };

    const saveCharacter = async (payload) => {
        let nextCharacters;
        if (payload.id) {
            nextCharacters = characters.map(character => character.id === payload.id ? { ...character, ...payload } : character);
        } else {
            nextCharacters = [{ ...payload, id: uid(), createdAt: new Date().toISOString() }, ...characters];
        }

        setCharacters(nextCharacters);
        setCharacterModal(null);
        setView({ page: 'group', groupId: payload.group });
        await persistCharacters(nextCharacters);
    };

    const deleteCharacter = async (characterId) => {
        const character = characters.find(item => item.id === characterId);
        if (!character || !confirm(`¿Eliminar a ${character.name} y toda su multimedia?`)) return;
        const nextCharacters = characters.filter(item => item.id !== characterId);

        setCharacters(nextCharacters);
        setMedia(prev => prev.filter(item => item.characterId !== characterId));
        setView({ page: 'group', groupId: character.group });
        await persistCharacters(nextCharacters);
    };

    const saveMedia = (payload) => {
        setMedia(prev => [{ ...payload, type: normalizeMediaType(payload.type, payload.src), id: uid(), createdAt: new Date().toISOString() }, ...prev]);
        setMediaModal(null);
    };

    const openEditCharacter = (character) => setCharacterModal({ mode: 'edit', character });
    const openNewCharacter = (groupId = 'cantantes') => setCharacterModal({ mode: 'new', character: { ...EMPTY_FORM, group: groupId } });
    const openPlayer = (items, title) => {
        if (!items.length) return;
        setPlayer({ items, title });
    };
    const updatePlaybackSettings = (nextSettings) => setPlaybackSettings(prev => ({ ...prev, ...nextSettings }));
    const saveBattleResult = ({ tag, winnerId, loserId }) => {
        setBattleResults(prev => {
            if (hasBattleResult(prev, tag, winnerId, loserId)) return prev;
            return [{ id: uid(), tag, winnerId, loserId, pairKey: getBattlePairKey(winnerId, loserId), createdAt: new Date().toISOString() }, ...prev];
        });
    };

    return (
        <div className="min-h-screen">
            <TopNav currentPage={view.page} onNavigate={navigate} />
            <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
                {loadError && <div className="metal-panel metal-shadow mb-5 rounded-2xl border border-yellow-400/50 p-4 font-bold text-yellow-100">⚠️ {loadError}</div>}
                {persistenceStatus && <div className="metal-panel metal-shadow mb-5 rounded-2xl border border-cyan-400/50 p-4 font-bold text-cyan-100">{persistenceStatus}</div>}
                {view.page === 'characters' && <GroupsScreen onOpenGroup={(groupId) => navigate({ page: 'group', groupId })} />}
                {view.page === 'gallery' && <GeneralGallery items={mediaWithCharacters} settings={playbackSettings} onSettingsChange={updatePlaybackSettings} onPlay={() => openPlayer(mediaWithCharacters, 'Galería general')} />}
                {view.page === 'battles' && <BattlesScreen characters={characters} mediaCountByCharacter={mediaCountByCharacter} ratings={ratings} battleResults={battleResults} onBattleResult={saveBattleResult} onOpenProfile={(id) => navigate({ page: 'profile', characterId: id })} />}
                {view.page === 'ranking' && <RankingScreen characters={characters} mediaCountByCharacter={mediaCountByCharacter} ratings={ratings} onOpenProfile={(id) => navigate({ page: 'profile', characterId: id })} />}
                {view.page === 'group' && <GroupScreen group={selectedGroup} characters={groupCharacters} onBack={() => navigate({ page: 'characters' })} onAdd={() => openNewCharacter(selectedGroup.id)} onOpen={(id) => navigate({ page: 'profile', characterId: id })} />}
                {view.page === 'profile' && selectedCharacter && <ProfileScreen character={selectedCharacter} mediaCount={selectedCharacterMedia.length} onBack={() => navigate({ page: 'group', groupId: selectedCharacter.group })} onGallery={() => navigate({ page: 'characterGallery', characterId: selectedCharacter.id })} onEdit={() => openEditCharacter(selectedCharacter)} onDelete={() => deleteCharacter(selectedCharacter.id)} />}
                {view.page === 'characterGallery' && selectedCharacter && <CharacterGallery character={selectedCharacter} items={selectedCharacterMedia} settings={playbackSettings} onSettingsChange={updatePlaybackSettings} onPlay={(items) => openPlayer(items, `Galería de ${selectedCharacter.name}`)} onBack={() => navigate({ page: 'profile', characterId: selectedCharacter.id })} onAdd={() => setMediaModal({ character: selectedCharacter })} />}
            </main>
            {characterModal && <CharacterFormModal initial={characterModal.character} onClose={() => setCharacterModal(null)} onSave={saveCharacter} />}
            {mediaModal && <MediaFormModal character={mediaModal.character} onClose={() => setMediaModal(null)} onSave={saveMedia} />}
            {player && <MediaPlayer items={player.items} title={player.title} settings={playbackSettings} onSettingsChange={updatePlaybackSettings} onClose={() => setPlayer(null)} />}
        </div>
    );
}

function TopNav({ currentPage, onNavigate }) {
    return (
        <header className="metal-panel sticky top-0 z-30 border-b border-cyan-200/20 bg-zinc-950/85 backdrop-blur-xl">
            <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
                <button onClick={() => onNavigate({ page: 'characters' })} className="text-left">
                    <p className="text-xs font-bold uppercase tracking-[.35em] text-cyan-200"></p>
                    <h1 className="cartoon-title text-4xl leading-none sm:text-5xl">SuperEliteG2</h1>
                </button>
                <nav className="metal-card metal-shadow grid grid-cols-2 gap-2 rounded-2xl border border-white/20 p-1 lg:grid-cols-4">
                    <NavButton active={!['gallery', 'battles', 'ranking'].includes(currentPage)} onClick={() => onNavigate({ page: 'characters' })}>👥 Personajes</NavButton>
                    <NavButton active={currentPage === 'gallery'} onClick={() => onNavigate({ page: 'gallery' })}>🖼️ Galería</NavButton>
                    <NavButton active={currentPage === 'battles'} onClick={() => onNavigate({ page: 'battles' })}>⚔️ Batallas</NavButton>
                    <NavButton active={currentPage === 'ranking'} onClick={() => onNavigate({ page: 'ranking' })}>🏆 Ranking</NavButton>
                </nav>
            </div>
        </header>
    );
}


function NavButton({ active, onClick, children }) {
    return <button onClick={onClick} className={`metal-button rounded-xl px-4 py-3 font-black transition ${active ? 'bg-gradient-to-br from-cyan-200 via-white to-slate-300 text-zinc-950' : 'bg-gradient-to-br from-slate-700 via-slate-900 to-black text-white hover:bg-white/10'}`}>{children}</button>;
}

function BattleCard({ character, score, mediaCount, tag, onChooseWinner, onOpenProfile }) {
    const group = getGroup(character.group);
    const handleKeyDown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onChooseWinner(character.id);
        }
    };

    return (
        <article onClick={() => onChooseWinner(character.id)} onKeyDown={handleKeyDown} role="button" tabIndex="0" aria-label={`Dar como ganador a ${character.name} en ${tag}`} className={`metal-card metal-shadow illuminated-card cursor-pointer overflow-hidden rounded-[2rem] border-2 transition hover:-translate-y-1 hover:brightness-110 ${group.border}`}>
            <div className="relative h-80 bg-black/40">
                <img src={character.photo || fallbackPhoto} alt={character.name} className="h-full w-full object-cover" />
                <span className="absolute left-4 top-4 rounded-full border border-white/30 bg-black/65 px-4 py-2 text-sm font-black uppercase tracking-[.25em] text-cyan-100">Elegir ganador</span>
            </div>
            <div className="grid gap-4 p-5">
                <div>
                    <p className="text-sm font-black uppercase tracking-[.25em]" style={{ color: group.color }}>{group.emoji} {group.label}</p>
                    <h3 className="letter-relief texture-text mt-2 text-4xl uppercase">{character.name}</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Info label="Puntaje" value={Number.isFinite(score) ? score.toFixed(1) : '0.0'} />
                    <Info label="Multimedia" value={mediaCount} />
                </div>
                <button onClick={(event) => { event.stopPropagation(); onOpenProfile(character.id); }} className="metal-button rounded-2xl bg-gradient-to-br from-fuchsia-400 via-purple-600 to-indigo-950 px-5 py-4 font-black">Ver ficha</button>
            </div>
        </article>
    );
}

function BattlesScreen({ characters, mediaCountByCharacter, ratings, battleResults, onBattleResult, onOpenProfile }) {
    const tags = useMemo(() => getBattleTags(ratings), [ratings]);
    const [selectedTag, setSelectedTag] = useState(tags[0] || 'Facciones');

    useEffect(() => {
        if (!tags.includes(selectedTag)) setSelectedTag(tags[0] || 'Facciones');
    }, [tags, selectedTag]);

    const availableBattles = useMemo(() => {
        const battles = [];
        for (let firstIndex = 0; firstIndex < characters.length; firstIndex += 1) {
            for (let secondIndex = firstIndex + 1; secondIndex < characters.length; secondIndex += 1) {
                const first = characters[firstIndex];
                const second = characters[secondIndex];
                if (!hasBattleResult(battleResults, selectedTag, first.id, second.id)) battles.push([first, second]);
            }
        }
        return battles;
    }, [characters, battleResults, selectedTag]);

    const completedForTag = Math.max(0, (characters.length * (characters.length - 1)) / 2 - availableBattles.length);
    const contenders = availableBattles[0] || [];
    const chooseWinner = (winnerId) => {
        if (contenders.length < 2) return;
        const loser = contenders.find(character => character.id !== winnerId);
        if (!loser) return;
        onBattleResult({ tag: selectedTag, winnerId, loserId: loser.id });
    };

    return (
        <section>
            <SectionTitle eyebrow="Arena Elite" title="Batallas" description="Elige una etiqueta y toca la tarjeta del personaje que gana. Esa pareja no volverá a repetirse en la misma etiqueta, pero sí puede competir en las demás." />
            {characters.length < 2 ? <EmptyState title="Faltan participantes" text="Agrega al menos dos personajes para preparar una batalla." /> : (
                <div className="grid gap-5">
                    <div className="metal-panel metal-shadow chrome-border grid gap-4 rounded-3xl p-5 md:grid-cols-[1fr_auto] md:items-end">
                        <label className="grid gap-2 font-black uppercase tracking-[.2em] text-cyan-100">
                            Etiqueta de competencia
                            <select value={selectedTag} onChange={(event) => setSelectedTag(event.target.value)} className="rounded-2xl border border-white/20 bg-slate-950/90 px-4 py-3 text-base font-bold normal-case tracking-normal text-white outline-none focus:border-cyan-300">
                                {tags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                            </select>
                        </label>
                        <div className="grid grid-cols-2 gap-3 text-center sm:min-w-72">
                            <Info label="Hechas" value={completedForTag} />
                            <Info label="Pendientes" value={availableBattles.length} />
                        </div>
                    </div>
                    {contenders.length < 2 ? <EmptyState title="Etiqueta completada" text={`Ya se jugaron todas las batallas posibles en ${selectedTag}. Elige otra etiqueta para continuar.`} /> : (
                        <div className="grid gap-5 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
                            <BattleCard character={contenders[0]} tag={selectedTag} score={(ratings[contenders[0].id] || {})[selectedTag]} mediaCount={mediaCountByCharacter[contenders[0].id] || 0} onChooseWinner={chooseWinner} onOpenProfile={onOpenProfile} />
                            <div className="metal-panel metal-shadow chrome-border rounded-full px-8 py-6 text-center">
                                <p className="cartoon-title text-6xl">VS</p>
                                <p className="mt-1 text-xs font-black uppercase tracking-[.25em] text-cyan-100/80">{selectedTag}</p>
                            </div>
                            <BattleCard character={contenders[1]} tag={selectedTag} score={(ratings[contenders[1].id] || {})[selectedTag]} mediaCount={mediaCountByCharacter[contenders[1].id] || 0} onChooseWinner={chooseWinner} onOpenProfile={onOpenProfile} />
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

function RankingScreen({ characters, mediaCountByCharacter, ratings, onOpenProfile }) {
    const [rankingOptionId, setRankingOptionId] = useState('general');
    const selectedOption = RANKING_OPTIONS.find(option => option.id === rankingOptionId) || RANKING_OPTIONS[0];
    const rankedCharacters = characters.map(character => {
        const rating = getCharacterRating(character, ratings);
        const mediaCount = mediaCountByCharacter[character.id] || 0;
        const score = getRankingScoreForOption(rating, selectedOption);
        return { character, rating, mediaCount, score };
    }).sort((a, b) => b.score - a.score || a.character.name.localeCompare(b.character.name));

    return (
        <section>
            <SectionTitle eyebrow="Tabla Elite" title="Ranking" description="Selecciona una etiqueta, un grupo o el puntaje general para reordenar automáticamente a las participantes por esa calificación." />
            <div className="metal-panel metal-shadow chrome-border mb-6 grid gap-3 rounded-3xl p-5 sm:grid-cols-[1fr_auto]">
                <div>
                    <p className="text-sm font-black uppercase tracking-[.25em] text-cyan-200">Filtro de ranking</p>
                    <p className="mt-1 text-sm font-semibold text-cyan-50/75">Las etiquetas sin calificación en el JSON cuentan como 0. Las puntuaciones se muestran de 0 a 100.</p>
                </div>
                <label className="grid gap-2 text-sm font-bold text-zinc-200 sm:min-w-72">Ver top por
                    <select value={rankingOptionId} onChange={event => setRankingOptionId(event.target.value)} className="rounded-xl border border-white/20 bg-zinc-900 p-3 text-white shadow-inner outline-none focus:border-cyan-300">
                        {RANKING_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                </label>
            </div>
            {rankedCharacters.length === 0 ? <EmptyState title="Ranking vacío" text="Agrega personajes para crear la tabla de posiciones." /> : (
                <div className="grid gap-4">
                    {rankedCharacters.map((entry, index) => {
                        const group = getGroup(entry.character.group);
                        return (
                            <button key={entry.character.id} onClick={() => onOpenProfile(entry.character.id)} className="metal-card metal-shadow illuminated-card grid gap-4 rounded-3xl border border-white/20 p-4 text-left transition hover:-translate-y-1 sm:grid-cols-[auto_96px_1fr_auto] sm:items-center">
                                <div className="cartoon-title text-5xl">#{index + 1}</div>
                                <img src={entry.character.photo || fallbackPhoto} alt={entry.character.name} className="h-24 w-24 rounded-2xl object-cover" />
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[.25em]" style={{ color: group.color }}>{group.emoji} {group.label}</p>
                                    <h3 className="letter-relief texture-text mt-1 text-3xl uppercase">{entry.character.name}</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-3 sm:min-w-64">
                                    <Info label={selectedOption.label} value={entry.score.toFixed(1)} />
                                    <Info label="Archivos" value={entry.mediaCount} />
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </section>
    );
}

function GroupsScreen({ onOpenGroup }) {
    return (
        <section>
            <SectionTitle eyebrow="" title="Personajes" description="" />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {GROUPS.map(group => (
                    <button key={group.id} onClick={() => onOpenGroup(group.id)} className={`metal-button illuminated-card rounded-3xl bg-gradient-to-br ${group.button} p-8 text-left transition hover:-translate-y-1 hover:scale-[1.02]`}>
                        <span className="text-5xl">{group.emoji}</span>
                        <h2 className="letter-relief mt-8 text-3xl uppercase tracking-wide">{group.label}</h2>
                        <p className="mt-2 text-sm font-semibold text-white/80">Abrir grupo</p>
                    </button>
                ))}
            </div>
        </section>
    );
}

function GroupScreen({ group, characters, onBack, onAdd, onOpen }) {
    return (
        <section>
            <HeaderBar title={`${group.emoji} ${group.label}`} subtitle={`${characters.length} personaje(s) en este grupo`} onBack={onBack} actionLabel="Agregar Personaje" onAction={onAdd} />
            {characters.length === 0 ? <EmptyState title="No hay personajes todavía" text="Agrega el primer personaje de este grupo con el botón de la cabecera." /> : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {characters.map(character => <CharacterCard key={character.id} character={character} onClick={() => onOpen(character.id)} />)}
                </div>
            )}
        </section>
    );
}

function CharacterCard({ character, onClick }) {
    const group = getGroup(character.group);
    return (
        <button onClick={onClick} className={`metal-card metal-shadow illuminated-card rounded-3xl border-2 ${group.border} ${group.glow} overflow-hidden text-left transition hover:-translate-y-1`} style={{ boxShadow: `0 0 0 1px ${group.color}55, 0 20px 50px rgba(0,0,0,.38), inset 0 1px 1px rgba(255,255,255,.35)` }}>
            {/* Contenedor adaptado con fondo oscuro y alineación al centro */}
            <div className="relative h-72 overflow-hidden bg-zinc-950/40 flex items-center justify-center p-2">
                <img src={character.photo || fallbackPhoto} alt={character.name} className="h-full w-full object-contain" />
            </div>
            <div className="metal-panel illuminated-card p-5 text-zinc-100 flex flex-col gap-2" style={{ background: `linear-gradient(135deg, rgba(255,255,255,.25), rgba(0,0,0,.45)), ${group.color}` }}>
                <h3 className="letter-relief texture-text line-clamp-1 text-2xl uppercase tracking-tight">{character.name}</h3>
                <div className="grid grid-cols-2 gap-3 text-sm font-bold opacity-90">
                    <span>🌎 {character.country || 'Sin país'}</span>
                    <span>🎂 {calculateAge(character.birthDate) || '—'} años</span>
                </div>
            </div>
        </button>
    );
}

function ProfileScreen({ character, mediaCount, onBack, onGallery, onEdit, onDelete }) {
    const group = getGroup(character.group);
    return (
        <section>
            <HeaderBar title="Ficha de personaje" subtitle={group.label} onBack={onBack} />
            <article className={`metal-card metal-shadow illuminated-card mx-auto max-w-4xl overflow-hidden rounded-[2rem] border-2 ${group.border}`}>
                <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_1.2fr]">
                    <div className="bg-black/35 p-5">
                        <img src={character.photo || fallbackPhoto} alt={character.name} className="h-[32rem] w-full rounded-[1.5rem] object-cover" />
                    </div>
                    <div className="flex flex-col gap-6 p-6 md:p-8">
                        <div>
                            <p className="text-sm font-black uppercase tracking-[.3em]" style={{ color: group.color }}>{group.emoji} {group.label}</p>
                            <h2 className="letter-relief texture-text mt-3 text-6xl uppercase leading-none">{character.name}</h2>
                        </div>
                        <dl className="grid gap-3 text-base sm:grid-cols-2">
                            <Info label="Fecha de nacimiento" value={character.birthDate || '—'} />
                            <Info label="Edad" value={`${calculateAge(character.birthDate) || '—'} años`} />
                            <Info label="País de nacimiento" value={character.country || '—'} />
                            <Info label="Ciudad de nacimiento" value={character.city || '—'} />
                            <Info label="Altura" value={character.height || '—'} />
                            <Info label="Multimedia" value={`${mediaCount} archivo(s)`} />
                        </dl>
                        <div className="mt-auto grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                            <button onClick={onGallery} className="metal-button rounded-2xl bg-gradient-to-br from-fuchsia-500 via-purple-600 to-indigo-900 px-6 py-4 text-lg font-black">📷 Galería de personaje</button>
                            <button onClick={onEdit} title="Editar" className="metal-button rounded-2xl bg-gradient-to-br from-yellow-200 via-yellow-400 to-amber-700 px-5 py-4 text-2xl">✏️</button>
                            <button onClick={onDelete} title="Eliminar" className="metal-button rounded-2xl bg-gradient-to-br from-red-300 via-red-600 to-red-950 px-5 py-4 text-2xl">🗑️</button>
                        </div>
                    </div>
                </div>
            </article>
        </section>
    );
}

function CharacterGallery({ character, items, settings, onSettingsChange, onPlay, onBack, onAdd }) {
    const galleryItems = items.map(item => ({ ...item, type: normalizeMediaType(item.type, item.src), character }));
    return (
        <section>
            <HeaderBar title={`Galería de ${character.name}`} onBack={onBack} actionLabel="Agregar archivo" onAction={onAdd} />
            <GalleryControls items={galleryItems} settings={settings} onSettingsChange={onSettingsChange} onPlay={() => onPlay(galleryItems)} />
            <MediaGrid items={galleryItems} emptyText="Este personaje todavía no tiene multimedia." />
        </section>
    );
}

function GeneralGallery({ items, settings, onSettingsChange, onPlay }) {
    return (
        <section>
            <SectionTitle eyebrow="" title="Galería General" description="" />
            <GalleryControls items={items} settings={settings} onSettingsChange={onSettingsChange} onPlay={onPlay} />
            <MediaGrid items={items} emptyText="No hay archivos en la galería general." />
        </section>
    );
}

function GalleryControls({ items, settings, onSettingsChange, onPlay }) {
    const [showSettings, setShowSettings] = useState(false);
    const isEmpty = items.length === 0;
    return (
        <div className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-4 metal-shadow">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-sm font-black uppercase tracking-[.25em] text-cyan-200">Reproductor multimedia</p>
                    <p className="mt-1 text-sm font-semibold text-zinc-400">{items.length} archivo(s) listos para reproducción automática.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <button disabled={isEmpty} onClick={onPlay} className="metal-shadow rounded-2xl bg-gradient-to-br from-emerald-300 via-emerald-600 to-emerald-950 px-5 py-3 font-black disabled:cursor-not-allowed disabled:opacity-40">▶ Play</button>
                    <button onClick={() => setShowSettings(prev => !prev)} className="metal-shadow rounded-2xl bg-gradient-to-br from-zinc-200 via-zinc-500 to-zinc-900 px-5 py-3 font-black">⚙ Configuración</button>
                </div>
            </div>
            {showSettings && <PlaybackSettingsPanel settings={settings} onSettingsChange={onSettingsChange} compact />}
        </div>
    );
}

function PlaybackSettingsPanel({ settings, onSettingsChange, compact = false }) {
    return (
        <div className={`${compact ? 'mt-4' : ''} grid gap-4 rounded-2xl border border-white/10 bg-black/30 p-4 sm:grid-cols-2`}>
            <label className="grid gap-2 text-sm font-bold text-zinc-200">Cambiar fotos cada
                <select value={settings.interval} onChange={event => onSettingsChange({ interval: Number(event.target.value) })} className="rounded-xl border border-white/10 bg-zinc-900 p-3 text-white">
                    <option value={3}>3 segundos</option>
                    <option value={5}>5 segundos</option>
                    <option value={10}>10 segundos</option>
                </select>
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm font-black text-zinc-100">
                <span>🔀 Orden aleatorio</span>
                <input type="checkbox" checked={settings.shuffle} onChange={event => onSettingsChange({ shuffle: event.target.checked })} className="h-5 w-5 accent-cyan-400" />
            </label>
        </div>
    );
}

function MediaGrid({ items, emptyText }) {
    if (!items.length) return <EmptyState title="Galería vacía" text={emptyText} />;
    return (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map(item => (
                <figure key={item.id} className="metal-card metal-shadow illuminated-card overflow-hidden rounded-3xl border border-white/20">
                    {item.type === 'video' ? <video src={item.src} controls className="h-72 w-full bg-black object-cover" /> : <img src={item.src} alt={item.caption || item.character.name} className="h-72 w-full object-cover" />}
                    <figcaption className="letter-relief texture-text p-4 text-center text-2xl">{item.character.name}</figcaption>
                </figure>
            ))}
        </div>
    );
}

function shuffleItems(items) {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }
    return shuffled;
}

function decodeGifBytes(src) {
    if (!src.startsWith('data:image/gif')) return null;
    const [, payload = ''] = src.split(',');
    if (!payload) return null;
    const binary = src.includes(';base64,') ? atob(payload) : decodeURIComponent(payload);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function getGifDurationMs(src) {
    const bytes = decodeGifBytes(src);
    if (!bytes) return null;
    let duration = 0;
    for (let index = 0; index < bytes.length - 9; index += 1) {
        if (bytes[index] === 0x21 && bytes[index + 1] === 0xf9 && bytes[index + 2] === 0x04) {
            const delay = bytes[index + 4] | (bytes[index + 5] << 8);
            duration += (delay || 10) * 10;
        }
    }
    return duration || null;
}

function MediaPlayer({ items, title, settings, onSettingsChange, onClose }) {
    const [index, setIndex] = useState(0);
    const [playlist, setPlaylist] = useState(() => settings.shuffle ? shuffleItems(items) : items);
    const [showSettings, setShowSettings] = useState(false);
    const [audioSrc, setAudioSrc] = useState('');
    const videoRef = useRef(null);
    const audioRef = useRef(null);
    const current = playlist[index] || playlist[0];

    const goNext = () => setIndex(prev => playlist.length ? (prev + 1) % playlist.length : 0);

    useEffect(() => {
        setPlaylist(settings.shuffle ? shuffleItems(items) : items);
        setIndex(0);
    }, [items, settings.shuffle]);

    useEffect(() => {
        if (!current) return undefined;
        if (current.type === 'video') {
            const video = videoRef.current;
            video?.play?.().catch(() => {});
            return undefined;
        }
        const gifDuration = current.type === 'gif' ? getGifDurationMs(current.src) : null;
        const delay = current.type === 'gif' ? (gifDuration || settings.interval * 1000) : settings.interval * 1000;
        const timer = window.setTimeout(goNext, delay);
        return () => window.clearTimeout(timer);
    }, [current?.id, settings.interval, playlist.length]);

    useEffect(() => {
        if (!audioRef.current) return;
        audioRef.current.play().catch(() => {});
    }, [audioSrc]);

    useEffect(() => () => {
        if (audioSrc) URL.revokeObjectURL(audioSrc);
    }, [audioSrc]);

    const pickAudio = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (audioSrc) URL.revokeObjectURL(audioSrc);
        setAudioSrc(URL.createObjectURL(file));
    };

    if (!current) return null;

    return (
        <div className="fixed inset-0 z-[60] bg-black text-white">
            <div className="absolute left-4 right-4 top-4 z-20 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="rounded-2xl bg-black/55 p-4 backdrop-blur-md">
                    <p className="text-xs font-black uppercase tracking-[.25em] text-cyan-200">{title}</p>
                    <h2 className="mt-1 text-2xl font-black">{current.character?.name || current.caption}</h2>
                    <p className="text-sm font-semibold text-zinc-300">{index + 1} / {playlist.length} · {current.type === 'video' ? 'Video: avanza al finalizar' : current.type === 'gif' ? 'GIF: avanza al finalizar' : `${settings.interval}s por foto`}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                    <label className="cursor-pointer rounded-2xl bg-white/15 px-4 py-3 font-black backdrop-blur-md hover:bg-white/25">🎵 Sonido
                        <input type="file" accept="audio/*" onChange={pickAudio} className="hidden" />
                    </label>
                    <button onClick={() => onSettingsChange({ shuffle: !settings.shuffle })} className={`rounded-2xl px-4 py-3 font-black backdrop-blur-md ${settings.shuffle ? 'bg-cyan-400 text-zinc-950' : 'bg-white/15 hover:bg-white/25'}`}>🔀</button>
                    <button onClick={() => setShowSettings(prev => !prev)} className="rounded-2xl bg-white/15 px-4 py-3 font-black backdrop-blur-md hover:bg-white/25">⚙</button>
                    <button onClick={onClose} className="rounded-2xl bg-red-600 px-4 py-3 font-black hover:bg-red-500">✕</button>
                </div>
            </div>
            {showSettings && <div className="absolute right-4 top-28 z-20 w-[min(28rem,calc(100vw-2rem))]"><PlaybackSettingsPanel settings={settings} onSettingsChange={onSettingsChange} /></div>}
            <div className="flex h-full w-full items-center justify-center">
                {current.type === 'video' ? (
                    <video ref={videoRef} key={current.id} src={current.src} controls autoPlay onEnded={goNext} className="max-h-full max-w-full object-contain" />
                ) : (
                    <img key={current.id} src={current.src} alt={current.caption || current.character?.name || 'Multimedia'} className="max-h-full max-w-full object-contain" />
                )}
            </div>
            <button onClick={goNext} className="absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/15 px-5 py-6 text-4xl font-black backdrop-blur-md hover:bg-white/25" aria-label="Siguiente multimedia">›</button>
            {audioSrc && <audio ref={audioRef} src={audioSrc} loop controls className="absolute bottom-4 left-1/2 z-20 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2" />}
        </div>
    );
}

function CharacterFormModal({ initial, onClose, onSave }) {
    const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });
    const age = calculateAge(form.birthDate);
    const setField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
    const onFile = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setField('photo', await fileToDataUrl(file));
    };
    const submit = (event) => {
        event.preventDefault();
        if (!form.name.trim()) return alert('El nombre es obligatorio.');
        onSave({ ...form, name: form.name.trim() });
    };
    return (
        <Modal title={form.id ? 'Editar personaje' : 'Agregar Personaje'} onClose={onClose}>
            <form onSubmit={submit} className="grid gap-4">
                <Input label="Nombre" value={form.name} onChange={value => setField('name', value)} required />
                <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="Fecha de nacimiento" type="date" max={todayISO()} value={form.birthDate} onChange={value => setField('birthDate', value)} />
                    <Input label="Edad automática" value={age !== '' ? `${age} años` : ''} readOnly placeholder="Se calcula con la fecha" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="País de nacimiento" value={form.country} onChange={value => setField('country', value)} />
                    <Input label="Ciudad de nacimiento" value={form.city} onChange={value => setField('city', value)} />
                </div>
                <Input label="Altura" value={form.height} onChange={value => setField('height', value)} placeholder="Ej: 1.70 m" />
                <Input label="Foto por URL" type="url" value={form.photo.startsWith('data:') ? '' : form.photo} onChange={value => setField('photo', value)} placeholder="https://..." />
                <label className="grid gap-2 text-sm font-bold text-zinc-200">Foto desde dispositivo
                    <input type="file" accept="image/*" onChange={onFile} className="rounded-xl border border-white/20 bg-black/30 p-3 text-white shadow-inner outline-none focus:border-cyan-300" />
                </label>
                {form.photo && <img src={form.photo} alt="Vista previa" className="h-40 w-full rounded-2xl object-cover" />}
                <label className="grid gap-2 text-sm font-bold text-zinc-200">Grupo designado
                    <select value={form.group} onChange={event => setField('group', event.target.value)} className="rounded-xl border border-white/20 bg-zinc-900 p-3 text-white shadow-inner outline-none focus:border-cyan-300">
                        {GROUPS.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}
                    </select>
                </label>
                <FormActions onClose={onClose} saveLabel="Guardar personaje" />
            </form>
        </Modal>
    );
}

function MediaFormModal({ character, onClose, onSave }) {
    const [src, setSrc] = useState('');
    const [type, setType] = useState('image');
    const onFile = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const dataUrl = await fileToDataUrl(file);
        setType(file.type === 'image/gif' ? 'gif' : (file.type.startsWith('video') ? 'video' : 'image'));
        setSrc(dataUrl);
    };
    const submit = (event) => {
        event.preventDefault();
        if (!src) return alert('Carga una URL o un archivo.');
        onSave({ characterId: character.id, src, type: normalizeMediaType(type, src), caption: character.name });
    };
    return (
        <Modal title={`Agregar archivo a ${character.name}`} onClose={onClose}>
            <form onSubmit={submit} className="grid gap-4">
                <Input label="URL de archivo" type="url" value={src.startsWith('data:') ? '' : src} onChange={value => { setSrc(value); setType(/\.(mp4|webm|ogg)(\?|$)/i.test(value) ? 'video' : (isGifSource(value) ? 'gif' : 'image')); }} placeholder="https://..." />
                <label className="grid gap-2 text-sm font-bold text-zinc-200">Archivo desde dispositivo
                    <input type="file" accept="image/*,video/*" onChange={onFile} className="rounded-xl border border-white/20 bg-black/30 p-3 text-white shadow-inner outline-none focus:border-cyan-300" />
                </label>
                {src && (type === 'video' ? <video src={src} controls className="h-56 rounded-2xl bg-black object-cover" /> : <img src={src} alt="Vista previa" className="h-56 rounded-2xl object-cover" />)}
                <FormActions onClose={onClose} saveLabel="Agregar archivo" />
            </form>
        </Modal>
    );
}

function HeaderBar({ title, subtitle, onBack, actionLabel, onAction }) {
    return (
        <div className="metal-panel metal-shadow chrome-border mb-6 flex flex-col gap-4 rounded-3xl p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
                {onBack && <button onClick={onBack} className="metal-button rounded-2xl bg-gradient-to-br from-slate-500 via-slate-800 to-black px-4 py-3 font-black hover:bg-white/20">←</button>}
                <div><h2 className="letter-relief text-4xl">{title}</h2><p className="text-sm font-semibold text-cyan-100/80">{subtitle}</p></div>
            </div>
            {actionLabel && <button onClick={onAction} className="metal-button rounded-2xl bg-gradient-to-br from-cyan-300 via-blue-600 to-blue-950 px-5 py-4 font-black">＋ {actionLabel}</button>}
        </div>
    );
}

function SectionTitle({ eyebrow, title, description }) {
    return <div className="metal-panel metal-shadow chrome-border mb-6 rounded-3xl p-6"><p className="text-sm font-black uppercase tracking-[.35em] text-cyan-200">{eyebrow}</p><h2 className="cartoon-title mt-2 text-5xl sm:text-6xl">{title}</h2><p className="mt-2 max-w-2xl text-cyan-50/75">{description}</p></div>;
}

function EmptyState({ title, text }) {
    return <div className="metal-panel metal-shadow chrome-border rounded-3xl border border-dashed border-white/20 p-12 text-center"><h3 className="letter-relief text-3xl">{title}</h3><p className="mt-2 text-cyan-50/75">{text}</p></div>;
}

function Info({ label, value }) {
    return <div className="metal-card metal-shadow rounded-2xl border border-white/20 p-4"><dt className="text-xs font-black uppercase tracking-widest text-cyan-100/65">{label}</dt><dd className="letter-relief mt-1 text-2xl">{value}</dd></div>;
}

function Input({ label, value, onChange, type = 'text', ...props }) {
    return (
        <label className="grid gap-2 text-sm font-bold text-zinc-200">{label}
            <input type={type} value={value} onChange={event => onChange?.(event.target.value)} className="rounded-xl border border-white/20 bg-black/30 p-3 text-white shadow-inner outline-none focus:border-cyan-300" {...props} />
        </label>
    );
}

function Modal({ title, children, onClose }) {
    return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="metal-panel max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/20 p-5 metal-shadow">
                <div className="mb-5 flex items-center justify-between gap-4">
                    <h2 className="letter-relief text-3xl">{title}</h2>
                    <button onClick={onClose} className="metal-button rounded-full bg-gradient-to-br from-slate-500 via-slate-800 to-black px-4 py-2 font-black hover:bg-white/20">✕</button>
                </div>
                {children}
            </div>
        </div>
    );
}

function FormActions({ onClose, saveLabel }) {
    return <div className="mt-2 grid gap-3 sm:grid-cols-2"><button type="button" onClick={onClose} className="metal-button rounded-2xl bg-gradient-to-br from-slate-500 via-slate-800 to-black px-5 py-4 font-black hover:bg-white/20">Cancelar</button><button type="submit" className="metal-button rounded-2xl bg-gradient-to-br from-emerald-300 via-emerald-600 to-emerald-950 px-5 py-4 font-black">{saveLabel}</button></div>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
