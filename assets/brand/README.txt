share-card.jpg   1200x630, opaque JPEG, ~20 KB. What the meta tags point at.

Drawn to a canvas rather than authored as a file: the wordmark is letter-spaced
by hand and the lockup is measured at draw time so the pair stays centred. The
generator is tools/share-card.html. Open it on the dev server and run:

    const cv = document.getElementById('cv');
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.86));
    await fetch('/_put/assets/brand/share-card.jpg', {method: 'PUT', body: blob});

tools/dev-server.py takes the PUT and writes the file, so the card never has to
be copied out of the console by hand.

WHY JPEG AT THIS SIZE. The previous card was a 600x315 RGBA PNG and neither
Messages nor WhatsApp would preview it. Two separate reasons, and both had to go:
600x315 is the documented minimum for a large card but both clients fall back to
a small thumbnail below 1200x630, and an alpha channel makes both of them drop
the preview outright. So there is no transparency anywhere on it.

Flat colour on purpose: a gradient dithers, and dither is what a small JPEG of
flat colour cannot compress.
