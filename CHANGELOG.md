# Changelog

## [2.0.0](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/compare/v1.4.0...v2.0.0) (2026-06-23)


### ⚠ BREAKING CHANGES

* **subject-uri-resolution:** persist every sampled URI outcome and resolve HTML-first ([#382](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/382))

### Features

* **subject-uri-resolution:** persist every sampled URI outcome and resolve HTML-first ([#382](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/382)) ([c897b22](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/c897b2297ca5440386e2bccdeb63b2429e5de614))

## [1.4.0](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/compare/v1.3.1...v1.4.0) (2026-06-22)


### Features

* **subject-uri-resolution:** accept RDF responses, promote HTML landing pages ([#377](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/377)) ([89bf13b](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/89bf13ba8e12e3353cb2caca791de649fc086200))


### Bug Fixes

* **config:** derive output dirs from a single OUTPUT_DIR so RDF-validity verdicts are served ([#376](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/376)) ([84fde05](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/84fde056d036925bfe300d87a7c2ec108797368e))
* keep an ARK/Handle PID namespace even when it is a terminology prefix ([#374](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/374)) ([ca04eb1](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/ca04eb1d128cc7a431628fe5cb8af52c90704016))

## [1.3.1](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/compare/v1.3.0...v1.3.1) (2026-06-19)


### Bug Fixes

* retry subject-URI sampling and mark its failure instead of discarding it ([#371](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/371)) ([20008a1](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/20008a128a82e71cf3d439cd319e54bbe2711463))

## [1.3.0](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/compare/v1.2.0...v1.3.0) (2026-06-17)


### Features

* emit per-distribution RDF-validity verdicts ([#362](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/362)) ([4e48f4e](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/4e48f4ebc61befa63d21c2433575587db176188f))

## [1.2.0](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/compare/v1.1.0...v1.2.0) (2026-06-17)


### Features

* keep invalid datasets, exclude only gone ones ([#353](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/353)) ([fecc59e](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/fecc59ea1cb79bc12a32ad1348e1612bd09ef87b))
* select datasets with TriG RDF distributions ([#350](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/350)) ([322697b](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/322697b3d4902fd9d9a9abdc06df7f3fd35cf722)), closes [#349](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/349)


### Bug Fixes

* exclude IIIF manifest URLs from the subject-URI resolution sample ([#347](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/347)) ([c4de391](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/c4de3919bc461149a2308c7a6224df8e9a3f0e80))
* skolemize PROV provenance nodes to prevent cross-stage blank-node collisions ([#354](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/354)) ([45f2171](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/45f2171c717ec56cd28da748985f336ed13124cc))

## [1.1.0](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/compare/v1.0.0...v1.1.0) (2026-06-12)


### Features

* persist failed sampled subject URIs and IIIF manifests with typed reasons ([#341](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/341)) ([1f5b4c6](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/1f5b4c63f7f576f1ac39e4e48420e322bfe5ce44))


### Bug Fixes

* retry transient subject-URI resolution failures and exclude them from the ratio ([#345](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/345)) ([0e9fe0a](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/0e9fe0a43bbfd5ec544bb25658bba0a58d514631)), closes [#339](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/339)

## [1.0.0](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/compare/v0.1.0...v1.0.0) (2026-06-11)


### ⚠ BREAKING CHANGES

* **deps:** Add RDF 1.2 support</li> <li><a href="https://github.com/rdfjs/N3.js/commit/a476b5b81eb8b2ae127dd62b81a89b954955cf81"><code>a476b5b</code></a> chore(docs): update reasoning snippet in README.md (<a href="https://redirect.github.com/rdfjs/N3.js/issues/553">#553</a>)</li> <li><a href="https://github.com/rdfjs/N3.js/commit/1c99c63f3dc6713f73806342855b5953cc04d487"><code>1c99c63</code></a> chore(deps-dev): Bump eslint-plugin-jest in the minor group (<a href="https://redirect.github.com/rdfjs/N3.js/issues/536">#536</a>)</li> <li>See full diff in <a href="https://github.com/rdfjs/N3.js/compare/v1.26.0...v2.0.1">compare view</a></li> </ul> </details> <details> <summary>Maintainer changes</summary> <p>This version was pushed to npm by <a href="https://www.npmjs.com/~rubensworks">rubensworks</a>, a new releaser for n3 since your current version.</p> </details> <br />

### Features

* add datatype partition analyzer ([#188](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/188)) ([718bf56](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/718bf56de8895279416204e42e5f5e670bd2b1a9))
* Add distinct objects to partitions ([#57](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/57)) ([75bae74](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/75bae74d5194ecc738f54f6a198e369a458e0ea0))
* Add distribution analyzer ([#32](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/32)) ([e292ec9](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/e292ec9c7863ecb54d05283ec06035d8fe90b8bf))
* add EDM and PiCo as additional detected vocabularies ([#248](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/248)) ([ddb436a](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/ddb436a863aef2e302a6afa545f1498ae5ba099c))
* add https://schema.org/ as additional detected vocabulary ([#249](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/249)) ([43fef92](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/43fef92d9e7f919693990b58affc8f6b1d89eff7))
* add language partition analyzer ([#201](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/201)) ([f410738](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/f410738b15bcb4e7adc7ae754153535c020206f1))
* add object class partition analyzer ([#189](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/189)) ([c312511](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/c31251111168acbeca6297b3de7499ac01ff2b21))
* add property domain/range analyzer ([#181](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/181)) ([0c731ed](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/0c731ed9bba5fd8a848dbbb789184ccf99ff2652))
* Add separate config for imports store ([c7225ad](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/c7225ad76f480c2cad4ce2abe0b947933484cac8))
* Add subject filter ([#38](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/38)) ([183fc7c](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/183fc7c9a66925b365c009147ff887e311763b61))
* add subject URI space analyzer ([#180](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/180)) ([ee95d62](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/ee95d6204ec2f23feb045723b7ac8363acfaf887))
* Analyze licenses ([#53](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/53)) ([a9ef2d0](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/a9ef2d031408b2e9b4e81e5f1bd28efc11fcbff2))
* Analyze vocabularies ([#42](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/42)) ([c230a11](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/c230a115493eeb093ecccef449f5999423d38fa2))
* configure QLever Docker image via environment variable ([#203](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/203)) ([0929e3a](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/0929e3a7a7f1c609e9139c8ddeaa93187d19793a))
* decouple IIIF detection from conformance and add a media signal ([#318](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/318)) ([2351bb3](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/2351bb315c434d03417d9cafc8a94fbaf13150ed))
* detect IIIF Presentation manifests per dataset ([#297](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/297)) ([3097a52](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/3097a523c3d56d2b11a1956d73d9297649014d38))
* enable adaptive per-endpoint SPARQL timeouts ([#300](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/300)) ([07bfa39](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/07bfa39ebdf780b9b95c683d3bcd675c3771bddf))
* exclude the dataset publisher from SCHEMA-AP-NDE sampling ([#331](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/331)) ([364f025](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/364f025f383106c3b811173e1c5f8defe489541f))
* Filter out invalid datasets more aggressively ([1d95d25](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/1d95d2599b9ce79ac1869e45ecdd20318f4e9e58))
* flag non-durable subject namespaces via a disallow list ([#332](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/332)) ([d5ba3aa](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/d5ba3aaa235fea059a9d3f304d7babeff490bd52))
* Handle distribution timeouts ([#34](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/34)) ([c92ea11](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/c92ea1132be13083e34700053e6b4773bcaead83))
* Handle SPARQL endpoint timeouts ([#36](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/36)) ([edc492d](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/edc492d163f03c945871d6a4ee9ac89f00c0cdea))
* Handle triple store write errors ([#35](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/35)) ([4dd379f](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/4dd379f9d18e67092ebad6e3962252db5ddcb29d))
* Import dumps to QLever ([#125](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/125)) ([1c627d7](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/1c627d727a6f2119090b7e9e51272666d839ed1f)), closes [#121](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/121)
* Import RDF dump if no SPARQL endpoint is available ([#39](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/39)) ([824b075](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/824b075a1715b99c0fe57fc0d1855a088c20c556))
* Improve classPartition readability by merging resources ([#66](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/66)) ([01be1ec](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/01be1ec4f55b6b2666e6addf4ccaf1e641fd4362))
* Improve CLI progress output ([#122](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/122)) ([1c43032](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/1c43032f6ba74eefe6b305df8b16cb9a060aad6f))
* Improve object counts ([#144](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/144)) ([b7af673](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/b7af673a71903c3476463189fd36629cf7f5ebb6)), closes [#143](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/143)
* Improve SPARQL error message ([#59](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/59)) ([c8aca5d](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/c8aca5dbfac142e9d2dd0f486da82dc74ebd614f))
* make dcat:mediaType optional in dataset selection query ([#245](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/245)) ([e254227](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/e2542278b85e3caa70f4f79bf4112b8571654199))
* normalize schema.org namespace via pipeline plugin ([#253](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/253)) ([3ca8d82](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/3ca8d8201083e4fe1787460c20c8e73b7301faec))
* Optimize SPARQL queries by validating endpoint ([#37](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/37)) ([ab8d141](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/ab8d14192b403d5a56e7159461f0e367561b7646))
* Output RDF validation errors to Summary ([#49](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/49)) ([d29a4d9](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/d29a4d954011267b80517cd30c79718211ce79d3))
* per-dataset n-quads output for a read-only QLever store ([#298](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/298)) ([#328](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/328)) ([0575947](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/0575947baa0c597a0791cf3010e20f4b444a7293))
* persist SHACL validation reports to the SPARQL store ([#296](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/296)) ([9be0ccf](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/9be0ccffe38c1ed4554ecd772da9eebf37ee4429))
* prefer streaming distributions ([#170](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/170)) ([bb03ff8](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/bb03ff875a5a0d019abc80b17b21741669e6f9ad))
* Replace format with mediaType ([a4a1496](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/a4a1496d46cfc365270ec5dc2706c53a654241e5))
* Require correct Content-Type for SPARQL results ([#50](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/50)) ([0e72658](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/0e7265868b65419de33b1dc6f865a5fc57cad91d))
* sample persistent URIs and measure subject-URI resolution ([#317](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/317)) ([8e2ab0a](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/8e2ab0a103606119f24ccfda9310fbe7278d60b9)), closes [#316](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/316)
* Select datasets from file ([#123](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/123)) ([34aab2a](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/34aab2ab67ace44952b0a8a0c2ab95bb10d20c63))
* select JSON-LD/zipped distributions and pass compressFormat through ([#292](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/292)) ([213e2bd](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/213e2bd7baca3049355b8da880cf746005a0ffc1))
* Select only valid datasets ([#126](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/126)) ([e28f9c7](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/e28f9c74e4c380c9bd8c9bb406d28f0bb8443aa6))
* skip unchanged datasets (release-please-managed version + provenance store) ([#333](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/333)) ([c9c6daa](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/c9c6daa0a16b4a4dea59d19dd0fc856b58fea802))
* store empirical distribution content type ([#182](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/182)) ([615353c](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/615353c30b63fac84da1374288b8cf8c7a3bab39))
* store terminology source name ([#166](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/166)) ([d727f01](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/d727f01060ae74dae441e9615afd27a85e3e73e6))
* Try all dumps in case of error ([#60](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/60)) ([4fd0424](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/4fd0424776fc333574993dd163d4693ff76a623b))
* use .well-known/void base URI for partition URIs ([#190](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/190)) ([fc9f716](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/fc9f716f2f1970cde9eebc0b7e507d7369cee8e8))
* use @lde/pipeline-console-reporter package ([#215](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/215)) ([2e661f4](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/2e661f4337777947194c9bdf6e07be9118ff1e23))
* validate datasets that publish under http://schema.org/ ([#291](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/291)) ([0d8f724](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/0d8f724aac36df71d06d2a5e0ae699589dbb5c91))
* validate IIIF conformance by resolving sampled manifest URIs ([#310](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/310)) ([4de9586](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/4de9586c87fe6c606ca1a85648c591478fbcf4a4))
* validate sample resources against SCHEMA-AP-NDE ([#280](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/280)) ([c46733d](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/c46733df6e01f7ab36a892e1aa663794dbfe2cf6))
* Write results to triple store ([#33](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/33)) ([6087a9d](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/6087a9d2b3c4c9e484a2e5a7f5f54d4f69c02503))


### Bug Fixes

* Add prefix to supplemental data ([#79](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/79)) ([ebe6c53](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/ebe6c53871e9890c89dc8d26cf899c9514b5c5a8))
* change to https://schema.org ([52c1f72](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/52c1f72e026f9861d33f5ed6195e7be0a9b94d4e))
* **ci:** explicitly pass secrets to reusable workflow ([961722c](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/961722cc40d3568ea44660c76f093823ee6564c3))
* Clear before import ([f6a4423](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/f6a44235cdfb3ed21aa45506062294df592e095a))
* Continue after index failure ([#134](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/134)) ([3128c4f](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/3128c4f7ca43ac65ddd1077ed2f6d325840b0919))
* detect and re-download incomplete files ([#199](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/199)) ([2a95762](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/2a957628351cb68115c95f01e7c4d70c95e952f8))
* distribution selection ([#168](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/168)) ([e711f32](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/e711f32a5855e4d65adddcd275eae9b3fd8e2d4d))
* Don’t throw on stop ([097ccf4](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/097ccf4bbec34d3d7795a327b20dc32b3fb4eee3))
* Ensure dataset unicity ([#152](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/152)) ([3124068](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/31240682de743815d524245a8535a36171420861))
* escape filename ([#169](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/169)) ([576e0bb](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/576e0bb822f4ce59196c196a9f04ff6da6f932c9))
* exclude dc4eu updates dumps ([20b5982](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/20b598274e1c0bccfc5f205810007c910d349223))
* extract content type from IANA URIs ([#177](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/177)) ([ccc3619](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/ccc361931cc07b45d0fa2a8109f1a770a7488890))
* Fix start ([4fec259](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/4fec259039f747ef22df084f396402e5a018598f))
* Ignore charset when comparing Content-Type ([4a7a8c0](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/4a7a8c0637422e8eb3df988d2c6482a0e456e0a1))
* import N-Quads ([#200](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/200)) ([e5cce8f](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/e5cce8f6e160683d9e299d128ccf787348b7295b))
* Improve native task runner ([#132](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/132)) ([e673927](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/e673927045108c9401cefbcd203c42da5d6efb4b))
* Malformed query on GraphDB ([#78](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/78)) ([b78c4a9](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/b78c4a9591934806a5497ea32dc4dd00a5a8c81d))
* match more closely ([78543e0](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/78543e0502d9e59a770ddb382b30ceb93ff0244f))
* move ARG before first FROM in Dockerfile ([#204](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/204)) ([dfceab6](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/dfceab6981c912fe5005c910c4e07196ea5dad94))
* Optimize class queries ([#120](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/120)) ([3f134ce](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/3f134ceced82da60e6949b81a4351b4e1212d326))
* optimize class-properties query for large datasets ([#186](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/186)) ([29dee84](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/29dee8451261e99faec0b176359ba7cabf2f93b0))
* optimize datatypes query for large datasets ([#193](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/193)) ([bcd894e](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/bcd894eb4d218d4a0472081122161f20aa13bea5))
* optimize object URI space query for large datasets ([#184](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/184)) ([6f5310e](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/6f5310e7dd7ac187f8e074aa66fdf1197c109471)), closes [#183](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/183)
* optimize subject URI space query for large datasets ([#185](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/185)) ([67ea490](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/67ea490761cc251ab702a8293dbb5ba9bf502e97))
* Preserve terminology source URI ([#146](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/146)) ([7f57a22](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/7f57a22c9d6ea22f423296aa4b541ce4ff62967a)), closes [#145](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/145)
* prevent zombie processes in NativeTaskRunner ([#198](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/198)) ([88a23d0](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/88a23d0a20f7ce4ee6f461550bb4ac83224cefb1))
* Raise import timeout ([addb55d](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/addb55d518d85aa1cdfc28fa047f85dfbf2403c3))
* Raise import timeout ([4f7dcba](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/4f7dcba5fb8d90589a788c8d7d1a1adb4ca1e3d9))
* replace all occurrences of ?dataset placeholder in SPARQL queries ([#191](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/191)) ([d53bd4f](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/d53bd4f408d25786a616683d08f4d7937bba9d89))
* replace blank nodes with deterministic URIs in SPARQL queries ([#202](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/202)) ([8856ba2](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/8856ba2986a39033b6c188c5d01380a249d96654))
* rewrite iiif.rq regex with [0-9]+ for QLever compatibility ([#302](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/302)) ([37b9070](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/37b9070273da2c2702d5b2e1b3cf240e5a1ed0c6))
* Scope query to named graph for imports ([#43](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/43)) ([e867fb4](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/e867fb41cef5a2c1816e243d59cc0531632cb34f))
* select datasets whose only RDF dump is application/rdf+xml ([#326](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/326)) ([e3933d2](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/e3933d2e1edd92b52f13a243dbc581de90e34009))
* Set base URI when storing summary ([#70](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/70)) ([fc4b6d0](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/fc4b6d026d8ee4d40cc0882bc04ac6be75710688))
* set QLever memory and timeout defaults to survive large datasets ([#312](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/312)) ([20fa2cb](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/20fa2cbd61a7af471fa9c55f46e50c635d7bb951))
* skip gzipped HTTP responses ([#176](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/176)) ([8357042](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/83570423e845e1ef265fa09ccd3e6f5edfc006bc))
* split class properties into separate queries ([#187](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/187)) ([1ba555c](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/1ba555ca4592d234633d8f14406ccae10b197082))
* update [@lde](https://github.com/lde) packages to fix FanOutWriter race condition ([#255](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/255)) ([11e9d56](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/11e9d5664847bfbba3665c9eed52e2ff9ee81544))
* use non-empty-matching regex for Virtuoso compatibility ([#192](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/192)) ([185dec8](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/185dec8dec25e5a9bcb73be19b46c2ba1b43e7c6))
* Use original request URL in case of redirects ([#51](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/51)) ([08e27eb](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/08e27eb2e137f4a247be0cde606a4fcfaff69be5))
* Work around QLever bug ([1d96ed6](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/1d96ed66c6776ca58c417fb8b46bbe37691834f2))


### Performance Improvements

* reduce memory use during indexing ([dcde097](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/dcde097a8879f86ab1f03c22ef74ef8c1acfcdfc))


### Reverts

* restore secrets: inherit for reusable workflow ([3926d29](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/3926d29fd8d21abe49e698707264a5b29b42578b))


### Build System

* **deps:** Bump n3 from 1.26.0 to 2.0.1 ([#212](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/212)) ([adb6f71](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/commit/adb6f7170cabfd9ca30edb6e75edaa72795a5e89))
