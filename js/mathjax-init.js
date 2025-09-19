/*
 * @Author: alex 
 * @Date: 2025-09-18 22:26:30 
 * @Last Modified by:   alex 
 * @Last Modified time: 2025-09-18 22:26:30 
 */
// js/mathjax-init.js — Vite + MathJax v4 (bundled), boldsymbol loaded in startup.ready
export async function setupMathJax() {
    // 1) Configure BEFORE loading the component
    window.MathJax = {
        startup: {
            typeset: false,
            // This runs after the core is initialized but BEFORE defaultReady() finalizes TeX.
            ready: async () => {
                // 2) Now it's safe to load the extension from the *bundle* family
                await import('@mathjax/src/bundle/input/tex/extensions/boldsymbol.js');

                // 3) Hand control back to MathJax to finish startup (reads tex.packages now)
                MathJax.startup.defaultReady();
            }
        },

        tex: {
            inlineMath: [['\\(', '\\)'], ['$', '$']],
            displayMath: [['\\[', '\\]'], ['$$', '$$']],
            packages: { '[+]': ['boldsymbol'] },   // tell TeX to use it
            macros: {
                vec: ['\\mathbf{#1}', 1],
                uvec: ['\\hat{\\mathbf{#1}}', 1],
                norm: ['\\left\\lVert #1 \\right\\rVert', 1],          // \norm{x} → ‖x‖
                normp: ['\\left\\lVert #1 \\right\\rVert_{#2}', 2]     // \normp{x}{p} → ‖x‖ₚ
            }
        },

        // Keep a11y defaults minimal & valid for v4
        options: {
            menuOptions: {
                settings: {
                    enrich: false,
                    speech: false,
                    braille: false,
                },
            },
        },
    };

    // 4) Load the combined component from the same bundle family
    await import('@mathjax/src/bundle/tex-chtml.js');

    // 5) Wait for startup (which includes the boldsymbol import via ready())
    await MathJax.startup.promise;
}

export function typeset(root) {
    return MathJax.typesetPromise(root ? [root] : undefined);
}
