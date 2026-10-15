// Ordered list of systems. Each lives in its own folder; see AGENTS.md for the contract.
import sandbox from './sandbox/index.js';
import director from '../story/director.js';
import lookdev from './lookdev/index.js';
import rain from './rain/index.js';
import audio from './audio/index.js';

// sandbox is only loaded with ?only=sandbox
export const SYSTEMS = [lookdev, rain, audio, sandbox, director].filter((s) => s.name !== 'sandbox' || new URLSearchParams(location.search).get('only') === 'sandbox');
