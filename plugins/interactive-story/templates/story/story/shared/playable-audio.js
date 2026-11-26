/** How far music turns down while a Node plays sound of its own, and how quickly. */
const DUCKED_VOLUME = 0.25;
const DUCK_FADE_SECONDS = 0.4;
const MEDIA_EVENTS = ["play", "playing", "pause", "ended", "emptied", "volumechange"];
/**
 * The sandbox's music and sounds. Music fades between tracks and carries on
 * across Nodes. While a Node's own video or audio plays with sound, the music
 * turns down, so a cinematic Scene's dialogue is heard over the score. Where
 * the browser will not start sound before the player touches the page, it
 * starts at the first click or key.
 */
export class DocumentPlayableAudio {
    #document;
    #music;
    #fading = new Set();
    #volumes = { music: 1, sound: 1 };
    #ducked = false;
    #waitingForGesture = false;
    #watched = new Map();
    #disposed = false;
    constructor(document) {
        this.#document = document;
    }
    music(url, fadeSeconds) {
        if (this.#disposed)
            return;
        const previous = this.#music;
        this.#music = undefined;
        if (previous) {
            this.#fading.add(previous);
            previous.fadeTo(0, fadeSeconds, () => {
                previous.element.pause();
                previous.element.removeAttribute("src");
                this.#fading.delete(previous);
            });
        }
        if (!url)
            return;
        const element = this.#document.createElement("audio");
        element.src = url;
        element.loop = true;
        const track = new Track(element, 0);
        this.#music = track;
        track.fadeTo(this.#musicLevel(), fadeSeconds);
        this.#play(element);
    }
    sound(url) {
        if (this.#disposed)
            return;
        const element = this.#document.createElement("audio");
        element.src = url;
        element.volume = this.#volumes.sound;
        // A sound the browser holds back until the player touches the page has missed its moment.
        void element.play()?.catch(() => { });
    }
    volumes(volumes) {
        this.#volumes = { ...volumes };
        this.#music?.fadeTo(this.#musicLevel(), 0.2);
        for (const root of this.#watched.keys()) {
            for (const media of mediaIn(root))
                media.volume = this.#volumes.sound;
        }
    }
    /**
     * Follows the video and audio a Node plays: they take the sound volume, and
     * while any of them is heard the music turns down. Returns the way to stop.
     */
    watchNode(root) {
        const update = (event) => {
            const target = event?.target;
            if (event?.type === "play" && isMedia(target))
                target.volume = this.#volumes.sound;
            this.#duck(mediaIn(root).some(isHeard));
        };
        // Media events do not bubble, but a capturing listener on the root still hears them.
        for (const type of MEDIA_EVENTS)
            root.addEventListener(type, update, true);
        const stop = () => {
            for (const type of MEDIA_EVENTS)
                root.removeEventListener(type, update, true);
            this.#watched.delete(root);
            this.#duck([...this.#watched.keys()].some((other) => mediaIn(other).some(isHeard)));
        };
        this.#watched.set(root, stop);
        update();
        return stop;
    }
    dispose() {
        this.#disposed = true;
        for (const stop of [...this.#watched.values()])
            stop();
        for (const track of [this.#music, ...this.#fading]) {
            track?.stop();
            track?.element.pause();
        }
        this.#music = undefined;
        this.#fading.clear();
    }
    #duck(ducked) {
        if (ducked === this.#ducked)
            return;
        this.#ducked = ducked;
        this.#music?.fadeTo(this.#musicLevel(), DUCK_FADE_SECONDS);
    }
    #musicLevel() {
        return this.#volumes.music * (this.#ducked ? DUCKED_VOLUME : 1);
    }
    #play(element) {
        const started = element.play();
        if (!started)
            return;
        started.catch((cause) => {
            if (cause?.name !== "NotAllowedError" || this.#waitingForGesture)
                return;
            this.#waitingForGesture = true;
            const view = this.#document.defaultView;
            const resume = () => {
                view?.removeEventListener("pointerdown", resume, true);
                view?.removeEventListener("keydown", resume, true);
                this.#waitingForGesture = false;
                if (this.#music && !this.#disposed)
                    void this.#music.element.play()?.catch(() => { });
            };
            view?.addEventListener("pointerdown", resume, true);
            view?.addEventListener("keydown", resume, true);
        });
    }
}
/** A music element and the fade it is in. */
class Track {
    element;
    #frame;
    #level;
    constructor(element, level) {
        this.element = element;
        this.#level = level;
        element.volume = level;
    }
    fadeTo(level, seconds, done) {
        this.stop();
        const from = this.#level;
        if (seconds <= 0 || from === level) {
            this.#set(level);
            done?.();
            return;
        }
        const started = Date.now();
        this.#frame = setInterval(() => {
            const progress = Math.min(1, (Date.now() - started) / (seconds * 1000));
            this.#set(from + (level - from) * progress);
            if (progress < 1)
                return;
            this.stop();
            done?.();
        }, 30);
    }
    stop() {
        clearInterval(this.#frame);
        this.#frame = undefined;
    }
    #set(level) {
        this.#level = level;
        this.element.volume = Math.min(1, Math.max(0, level));
    }
}
function mediaIn(root) {
    return [...root.querySelectorAll("video, audio")];
}
function isMedia(value) {
    return typeof value === "object" && value !== null && "paused" in value && "volume" in value;
}
/** Playing with sound the player can hear. */
function isHeard(media) {
    return !media.paused && !media.ended && !media.muted && media.volume > 0;
}
