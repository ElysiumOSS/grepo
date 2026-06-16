# Changelog

## [0.5.0](https://github.com/ElysiumOSS/grepo/compare/0.4.2...0.5.0) (2026-06-16)

### Features

* **cli:** add gitingest-free changelog command ([dccddd4](https://github.com/ElysiumOSS/grepo/commit/dccddd4969b31614d4d712dd997039bca4d0685f))

### Bug Fixes

* **changelog:** avoid polynomial ReDoS in conventional-commit regex ([2e860a3](https://github.com/ElysiumOSS/grepo/commit/2e860a38935c95594391c1a07c7205e813c77575))

## [0.4.2](https://github.com/ElysiumOSS/grepo/compare/0.4.1...0.4.2) (2026-06-16)

### Bug Fixes

* **deps:** bump vitest to 3.2.6 (GHSA-5xrq-8626-4rwp) ([16b23bf](https://github.com/ElysiumOSS/grepo/commit/16b23bfd4062a9c6936a5169cfdbddf2715a5777))
* stop leaking GitHub token to gitingest.com; pin mmdc; add local-content path ([adcea52](https://github.com/ElysiumOSS/grepo/commit/adcea520590427161eb9cf7566bac09bd5b56c17))

## [0.4.0](https://github.com/ElysiumOSS/grepo/compare/0.3.0...0.4.0) (2026-03-17)

### Features

* **cli:** wire interactive config setup when no API keys are found ([927037d](https://github.com/ElysiumOSS/grepo/commit/927037d2723a350c8d4a6b9de9c5db094ab4531e))
* **config:** add config file schema, reader, and edge case tests ([ab6538e](https://github.com/ElysiumOSS/grepo/commit/ab6538ee44d95996c8a05e82821bdb9c2859d481))
* **config:** add interactive config setup prompt ([10890f9](https://github.com/ElysiumOSS/grepo/commit/10890f9bcc84963067bca2679f6a8a4efcc09f34))
* **config:** add writeConfigFile with 0600 permissions ([1745ec5](https://github.com/ElysiumOSS/grepo/commit/1745ec53531c6ed1dc3c8f0603098b6978b44320))
* **config:** wire config file into buildConfig for API key resolution ([9192026](https://github.com/ElysiumOSS/grepo/commit/91920269453c1bb09826833ba2449edc70c05a24))

## [0.3.0](https://github.com/ElysiumOSS/grepo/compare/0.2.0...0.3.0) (2026-03-16)

### Features

* **cli:** ✨ rebrand to grepo and auto-detect default branch ([3d21adc](https://github.com/ElysiumOSS/grepo/commit/3d21adc1e62b2751367680697860526380689aed))

## 0.2.0 (2026-03-16)

### Features

* migrate grepo CLI from scripts monorepo to standalone package ([8557379](https://github.com/ElysiumOSS/grepo/commit/8557379df52af7a7bb9c9257e00a3670bc8346d2))
