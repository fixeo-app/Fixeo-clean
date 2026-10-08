import { layout, space, rafiVisualTokens } from './tokens';
export const pageLayout = {
 content: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.md, width: '100%' as const, maxWidth: layout.screen.maxContentWidth, alignSelf: 'center' as const },
 intro: { paddingTop: 0, gap: space.xs },
 signature: { width: 40, height: 2, backgroundColor: rafiVisualTokens.champagne, marginBottom: 0 },
};
