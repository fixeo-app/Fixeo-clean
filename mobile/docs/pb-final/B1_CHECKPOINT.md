# B1 — Keyboard, shell and RAFI geometry

PASS SOFTWARE: TypeScript; 33 targeted tests including actual rendered Client field registration and Artisan fields, resize/overlay geometry, selection changes, voice privacy, CRM cancellation, finance witnesses, PDF contract and shell routes.

Client raw inputs in Composer, Intelligence (clarification/contact) and Diagnostic now use KeyboardInput, measured by the existing RafiScrollView registry. Multiline native viewport is bounded to 56–144 dp; selection/content/layout changes request reveal. ArtisanField adopts the same selection/layout reveal and bounds. Native TextInput owns internal caret scrolling; Android resize remains the IME owner. Actual caret and keyboard behavior remain PHYSICALLY-DEFERRED R02–R05.

FixeoScreen transactional mode suspends the global dock; ArtisanPage now uses its transactional prop. Client composition is transactional. RAFI request family is fixed at 96 dp / 144 dp frame; tracking 64/96; home 120/180; Artisan advice 32/48. Keyboard hides the request hero without rescaling or replacing MASTER. No asset or renderer change.

No backend change. No build, web preview, Auth change, merge or Production write. Source and tests committed together. Regression log: evidence/b1-tests.tap. B2 will replace the currently overlapping UI states; B1 does not claim F02 closure.
