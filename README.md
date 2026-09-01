# ComicAPNG Web

ComicAPNG Web is the browser and PWA sibling of [ComicAPNG Desktop](https://github.com/zeronx798/ComicAPNG). It creates, extracts, and reads APNG comic books entirely on the user's device. Comic images are never uploaded, and the installed application shell remains usable offline after its first successful load.

The stable GitHub Pages site is intended to be available at [zeronx798.github.io/ComicAPNG-Web](https://zeronx798.github.io/ComicAPNG-Web/).

## Development

Requirements: Node.js 22 or newer and npm.

```sh
npm install
npm run dev
```

Run the complete cross-platform validation pipeline with one command:

```sh
npm run ci
```

The command checks source policy, linting, types, unit and APNG tests, the production PWA build, Chromium functional/responsive/offline tests, Firefox and WebKit smoke tests, and the final static artifact.

## Versioning

`package.json` is the canonical project version source. Set a future version without creating a Git tag:

```sh
npm version 0.2.0 --no-git-tag-version
```

Every non-release build identifies itself as `v<package-version>-dirty`; here, `dirty` means "not an official tagged release build," regardless of Git working-tree state. A matching stable or RC tag supplies the official display and artifact version. The release tag's base version must match `package.json`.

## Documentation

- [Simplified Chinese user guide](docs/README_zh.md)
- [Technical specifications](docs/tech-specs.md)
- [APNG library evaluation](docs/apng-library-evaluation.md)

ComicAPNG Web has no backend, account system, analytics, telemetry, cloud storage, plugin system, or comic-source downloader.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
