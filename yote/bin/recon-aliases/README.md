# recon-aliases

Neutral wrapper scripts for the recon toolkit (installed live in
`/home/toxic/.local/bin/` on yote). Team convention: use ONLY these neutral
names in chat, docs, and code — never the underlying original package names.

Each wrapper is a 2-line sh script:

    #!/bin/sh
    exec "<toolkit-bin>" "$@"

`ferret` is the dispatch hub: `ferret <tool> [args]` routes to any wrapper;
`ferret list` enumerates the den. It also carries short dispatch forms
(probe, dns, sub, sig, ports, crawl, tls, alt, db, asn, cdn, cloud, cidr,
tld, serve, notify, chaos, prox, shuffle, aix).

Wrapper names (21 + hub):

    tman, webprobe, dnsprobe, subprobe, sigscan, portprobe, crawlprobe,
    tlsprobe, altprobe, dbprobe, asnprobe, cdnprobe, cloudprobe, cidrprobe,
    tldprobe, httpserve, shuffledns, aix, notify, chaos, proxify, ferret

To (re)install on yote:

    cp -p recon-aliases/* /home/toxic/.local/bin/
    chmod +x /home/toxic/.local/bin/{tman,webprobe,dnsprobe,subprobe,sigscan,portprobe,crawlprobe,tlsprobe,altprobe,dbprobe,asnprobe,cdnprobe,cloudprobe,cidrprobe,tldprobe,httpserve,shuffledns,aix,notify,chaos,proxify,ferret}

Re-check wrapper coverage after any toolkit reinstall — new toolkit binaries
need new neutral wrappers here.
