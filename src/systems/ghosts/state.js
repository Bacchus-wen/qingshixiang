import { uniform } from 'three/tsl';
// Shared by the VAT crowd, download fallback, traffic, and the door fragment.
// Full flood overrides this fade locally in syncLife; the fragment still owns its value.
export const crowd = uniform(1);
