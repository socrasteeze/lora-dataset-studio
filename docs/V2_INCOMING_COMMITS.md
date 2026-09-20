# V2 incoming content window

135 commit subjects reviewed for architectural scope on 2026-09-20. This includes
the 122 commits acknowledged without content by the earlier ancestry-only merge.
Detailed patch classification is still required before integration; this inventory
is not an instruction to adopt every change. Source commits need fork-policy
review, and generated frontend commits must be replaced with a fork build.

| Commit | Subject |
|---|---|
| `109363915` | Port seven public LDS features into source plugins |
| `8a9808265` | Add public plugin framework foundations |
| `e2f8aa828` | Port public local Live channel into an independent plugin |
| `4c58a54cc` | Port the public resource monitor with its owned readout |
| `28e91673a` | Port public checkpoint and image publishing to Civitai |
| `6151285fa` | Limit Civitai contributions to public checkpoint surfaces |
| `c77f48822` | Add the public frontend plugin SDK and standalone builder |
| `b44fa3027` | Add bounded public SDK adapters and real plugin integration tests |
| `489c607bc` | Port public API image engines with owned settings and OAuth |
| `cc6f16a07` | Reject malformed Civitai publishing request bodies |
| `9ee241c19` | feat(video): project public video lane into owned plugin source |
| `8cb92f918` | Qualify public Civitai SDK and confine gallery exports |
| `598a11f8d` | fix(plugins): preserve registration state through isolated rollback |
| `58fa52536` | fix(plugins): gate owned HTTP routes before disabled plugin hooks |
| `03234cc1f` | feat(store): project signed acquisition client and operator tools |
| `d11adae87` | feat(plugins): project public frontend framework with closed activation |
| `85a724d78` | feat(sdk): close public Video and API engine adapters |
| `eae80c30a` | fix(plugins): disable early and global callbacks with their owner |
| `a97b8fab8` | Extract public cloud training product sources |
| `372a54cdf` | fix(plugins): retain Flask callback dispatch through admission |
| `1395f6fd7` | fix(packaging): keep identity checks independent of app configuration |
| `04815ac4d` | feat(plugins): project public custom-node recipe API and worker |
| `8c878f3bd` | feat(plugins): connect public frontend SDK to shared host services |
| `7025a2063` | feat(setup): project managed Python and plugin preparation on public main |
| `b2c10852c` | feat(plugins): expose public Store and protect Setup preparation admission |
| `3a8e48418` | fix(cloud): close public SDK and preserve rental ownership |
| `6a11f10f5` | fix(cloud): normalize public guide headings and quantizer ownership |
| `62cf0cb74` | Protect cloud quantization rental ownership and account recovery |
| `8d99802f5` | Keep cloud quantization cleanup available until release is confirmed |
| `3553889d1` | Complete core setup without requiring optional engines or plugins |
| `c9d832310` | Complete public plugin settings claims and capability probes |
| `029a24488` | feat(plugins): mount public Store and owner surfaces with core-first setup |
| `0c8cba09b` | feat(core): mount public plugins in the application factory |
| `c8092c000` | Register public Video shot detection installation |
| `b9aba09c7` | Transfer plugin installers from core catalogs and retain managed Python |
| `50ca28289` | fix(core): enforce cloud and restoration owner admission |
| `ae028c063` | build(frontend): assemble public core Store interface |
| `d635fb75f` | fix(restoration): preserve plugin HTTP refusal details |
| `5dbd32faf` | test(frontend): follow public plugin source ownership |
| `31c71c7de` | test(frontend): initialize real SDK host in plugin fixtures |
| `e552ea0a2` | fix(setup): keep preparation and readiness with each public plugin |
| `f2c7d53ec` | feat(seedvr2): prepare pinned nodes and models together |
| `8666e1637` | fix(plugins): keep cloud and model tools optional on product screens |
| `8ce84d43e` | fix(cloud): route launch help to plugin settings |
| `524ff4aee` | test(frontend): verify optional owners of lightbox help and news |
| `b2a6a474d` | test(restoration): exercise active public products and lazy editors |
| `2f668abf5` | test(canvas): mount SDK fixtures and target public owners |
| `7e8816fb8` | test(video): reconnect public Studio contracts and owned settings |
| `6f65c1ab7` | Add public plugin packaging CLI and API 1.20 authoring docs |
| `d80980abc` | fix(improve): save product settings through their owner |
| `5eac566d1` | test(canvas): provide legacy entry point to the real SDK host |
| `49e04e99e` | fix(settings): keep core model credentials available without plugins |
| `17b1d567b` | fix(packages): use static worker imports and safe dependency presence API |
| `6d6939e5a` | Read declared public SDK adapters during package validation |
| `b7d2286d9` | Emit the declared Live HLS worker in public plugin packages |
| `d9d727178` | test(public): reconnect cloud dense contracts to plugin owners |
| `4d4a1977a` | Document the public dependency presence helper |
| `4c0e9b6c9` | fix(training): resume harvested cloud checkpoints by saved owner |
| `8c956dab2` | fix(public): preserve owned settings contracts and video packaging |
| `8a21d61a1` | fix(training): refuse cloud continuation before replacing a local lane |
| `a694ce39f` | test(public): exercise owned image tools and independent setup surfaces |
| `895320b21` | test(plugins): follow canonical cloud guide and runtime contracts |
| `de81b1207` | fix(help): connect first-run guidance to the core setup guide |
| `33d5cb753` | test(public): mount setup owners and retarget Canvas contracts |
| `36b6a73ce` | fix(help): keep first-run guidance as a navigation topic |
| `6b89eb702` | test(public): validate news and help against active plugin owners |
| `4a23bfed7` | test(public): reconcile product contracts with public host ownership |
| `32f92fa8e` | fix(cloud): honor the disable-blocker filter argument order |
| `a575d6278` | test(public): isolate plugin activation in backend fixtures |
| `005f5951e` | fix(video): preserve owned queries and gallery source access |
| `a4aff0c6d` | fix(video): report unavailable cloud training before account checks |
| `528b4451f` | build(frontend): assemble public V2 core for Store distribution |
| `49eaec31b` | test(video): exercise public owners with explicit plugin fixtures |
| `93817d780` | fix(lineage): obtain checkpoint badges from the publisher plugin |
| `1979d5acc` | test(plugins): exercise provider owners and scoped settings |
| `75e34fc3a` | test(cloud): exercise public owners with isolated provider doubles |
| `2d605fa64` | fix(seedvr2): point settings to integrated preparation |
| `11a367882` | fix(live): protect active channels from memory release |
| `408a1250d` | fix(cloud): use the active owner for dense credential preflight |
| `b48d14bd0` | fix(packaging): build the core archive from committed objects |
| `32adcc10e` | fix(live): require the host memory guard API |
| `2d5153729` | test(plugins): exercise visual and scraping owners through public SDK |
| `5d7318604` | Guard public ports with externally pinned exact-history manifests |
| `3c90a4a11` | docs(plugins): add public setup and plugin presentation captures |
| `6c95fe562` | test(api-engines): run reference and dataset flows with explicit owners |
| `086d5c4c7` | test(cloud): qualify Dense Pod and CPU Model tools public owners |
| `ec8e77040` | test(live): include memory release in public lifecycle contract |
| `9161b7461` | fix(packaging): isolate Git context and reject nested private archives |
| `f5e8340ce` | ci: cover public plugin and release tooling contracts |
| `530a52ab3` | docs(store): show the illustrated public catalog and gallery |
| `6fb69e928` | docs(sdk): describe the active-work memory guard |
| `8f2d7066b` | fix(live): retain memory protection between channel clips |
| `c755630d1` | test(packaging): create isolation fixtures without Git transport |
| `d16a2de07` | Align remaining backend contracts with public plugin ownership |
| `7cee59b9a` | Guard reviewed generated wheel resources by exact provenance |
| `18172ca80` | fix(publication): bind Git inspection and validate generated wheel identity |
| `5bdd574d0` | Keep transient local engine readiness out of durable setup checks |
| `47a3c677a` | test(plugins): align engine catalogs and installer contracts with public owners |
| `ab77430c6` | Qualify remaining visual contracts with explicit plugin owners |
| `5478e4495` | fix(bank): retry failed scoring and preserve independent results |
| `1c97aa6ec` | build(frontend): clarify Bank scoring index readiness |
| `c8e014635` | release(v2): connect the public Store and prepare the preview |
| `39b1308a3` | build(frontend): present the V2 plugin release |
| `d2e25d413` | release(v2): make V2 the main stable release |
| `6447fbf6f` | fix(upgrade): recover legacy cloud rentals without enabling new rentals |
| `d477f9375` | fix(upgrade): reconcile terminal legacy rental history |
| `6f879fcf0` | release(v2): advance the stable release candidate version |
| `52a8d9b69` | fix(deps): patch development YAML merge CPU limit |
| `a5093fa01` | fix(tests): resolve shared SDK dependencies without recursive hooks |
| `85ba9c0b3` | test(docs): keep referral disclosure independent of plugin pricing |
| `88247a6a2` | release(v2): advance candidate after isolated SDK test correction |
| `04a0c5cb9` | fix(tests): resolve SDK build dependencies from the host tree |
| `2721c256a` | release(v2): advance candidate after backend test isolation failure |
| `febcf70fc` | fix(tests): preserve SDK config identities across fixture resets |
| `d2291cdaa` | release(v2): advance candidate after plugin CI workspace correction |
| `b593ee3af` | fix(ci): prepare isolated plugin temp roots before backend suite |
| `d41867cea` | fix(tests): target video continuation mocks at SDK boundary |
| `407d25c4a` | fix(bank): expose effective Python and explicit calculation diagnostics |
| `cc5a10087` | fix(bank): keep Python recovery controls available after CUDA detection |
| `105c9c58c` | fix(setup): explain Bank repair runtime selection |
| `bf39a255f` | docs(bank): explain Python runtime checks and managed repair selection |
| `3fe3d4f0e` | build(frontend): ship Bank Python recovery controls |
| `29c980f70` | chore: maintain v2 as default and freeze v1 |
| `b581af1b7` | feat: add data-preserving migration helper for v2 |
| `0e828a3e7` | fix(studio): offer lower steps with three-choice navigation |
| `4f29d4bfd` | fix: use Git branch status consistently across update UI |
| `fdb2feb98` | Align public SDK with installed V2 plugin contracts |
| `b6b7e5815` | fix(caption-lab): match dataset prompts and saved caption options |
| `cd0e42cec` | build(frontend): publish dataset-aware Caption Lab |
| `090c5232f` | fix(plugins): explain and guide locked plugin installation |
| `5c502341c` | build(frontend): publish plugin administration guidance |
| `b1d2f0b67` | fix: apply project referral to every Vast.ai navigation link |
| `7fb7babf6` | build: refresh frontend for Vast.ai referral links |
| `f1757ce37` | fix(plugins): reveal installation review from lower catalog cards |
| `ce92e3499` | build(frontend): deliver visible plugin installation review |
