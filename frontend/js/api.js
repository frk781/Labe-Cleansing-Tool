/**
 * API client — fetch wrapper for backend endpoints.
 */
const API = {
    BASE: '/api',

    async _fetch(url, options = {}) {
        try {
            const res = await fetch(this.BASE + url, {
                headers: { 'Content-Type': 'application/json' },
                ...options,
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(err.detail || `HTTP ${res.status}`);
            }
            return res;
        } catch (e) {
            console.error(`API error [${url}]:`, e);
            throw e;
        }
    },

    async loadDataset(path) {
        const res = await this._fetch('/dataset/load', {
            method: 'POST',
            body: JSON.stringify({ path }),
        });
        return res.json();
    },

    getImageUrl(name) {
        return `${this.BASE}/dataset/images/${encodeURIComponent(name)}`;
    },

    async getAnnotations(imageName) {
        const res = await this._fetch(`/annotations/${encodeURIComponent(imageName)}`);
        return res.json();
    },

    async saveAnnotations(imageName, data) {
        const res = await this._fetch(`/annotations/${encodeURIComponent(imageName)}`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
        return res.json();
    },

    async samPredict(imageName, points, multimask = true) {
        const res = await this._fetch('/sam/predict', {
            method: 'POST',
            body: JSON.stringify({
                image_name: imageName,
                points,
                multimask,
            }),
        });
        return res.json();
    },

    async samStatus() {
        const res = await this._fetch('/sam/status');
        return res.json();
    },

    async updateClasses(classes) {
        const res = await this._fetch('/classes', {
            method: 'PUT',
            body: JSON.stringify({ classes }),
        });
        return res.json();
    },

    async getClasses() {
        const res = await this._fetch('/classes');
        return res.json();
    },
};
