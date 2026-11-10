import { createStore } from 'framework7/lite';

// Liked tracks and the one that is "playing" (the demo has no audio: playing is only a state).
const store = createStore({
  state: {
    liked: ['t1', 't8', 't4'],
    playing: 't7',
  },
  getters: {
    liked({ state }) {
      return state.liked;
    },
    playing({ state }) {
      return state.playing;
    },
  },
  actions: {
    toggleLike({ state }, id) {
      state.liked = state.liked.includes(id) ? state.liked.filter((x) => x !== id) : [...state.liked, id];
    },
    togglePlay({ state }, id) {
      state.playing = state.playing === id ? null : id;
    },
  },
});

export default store;
