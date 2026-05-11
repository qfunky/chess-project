(function() {
    const SUN  = '<circle cx="12" cy="12" r="4"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>';
    const MOON = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    const btn = document.getElementById('themeToggle');
    const svg = document.getElementById('themeSvg');
    if (!btn || !svg) return;
    function apply(t) {
        document.documentElement.setAttribute('data-theme', t);
        localStorage.setItem('chessTheme', t);
        svg.innerHTML = t === 'dark' ? SUN : MOON;
    }
    apply(localStorage.getItem('chessTheme') || 'light');
    btn.addEventListener('click', () => {
        apply(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
})();
