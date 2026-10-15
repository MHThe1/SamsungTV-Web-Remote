# Contributing to Samsung Smart TV Web Remote

Thank you for your interest in improving this project! Contributions from the community are welcome.

---

## Development Setup

1. **Fork and clone the repository**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/samsung-tv-web-remote.git
   cd samsung-tv-web-remote
   ```
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Start the local server**:
   ```bash
   npm start
   ```
4. Access the web interface at `http://localhost:3000`.

---

## How You Can Help

- **Testing with more TV models**: Samsung releases TVs with slight firmware differences. Reporting your model and test results helps improve device compatibility.
- **New App Launchers**: Adding deep-link app IDs for more streaming services (e.g., Plex, Apple TV, Twitch, BBC iPlayer).
- **UI & UX Improvements**: Polishing animations, theme options, or accessibility.
- **Bug Fixes**: Handling edge cases in WebSocket reconnections, token renewals, or network changes.

---

## Pull Request Guidelines

1. Create a feature branch: `git checkout -b feature/your-feature-name`.
2. Commit your changes with clear, concise messages.
3. Test thoroughly with a real Samsung TV or mock endpoints.
4. Ensure no personal credentials (TV IP, MAC address, pairing tokens) are committed in `config.json`.
5. Open a Pull Request against `main` describing your changes.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
