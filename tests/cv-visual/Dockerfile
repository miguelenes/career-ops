# Keep this version aligned with the exact playwright dependency in package.json.
# The image digest below also pins Chromium, Node, and the base operating system.
FROM mcr.microsoft.com/playwright:v1.64.1-noble@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf

# Prefer frozen fonts/Poppler. If the snapshot is unavailable after retries,
# use signed official Noble archives; this sacrifices the freeze, not test coverage.
# Retry the whole update/install transaction: an outage can begin after update.
RUN rm -f /etc/apt/sources.list /etc/apt/sources.list.d/nodesource.list \
    && printf '%s\n' \
      'Types: deb' \
      'URIs: https://snapshot.ubuntu.com/ubuntu/20260901T000000Z/' \
      'Suites: noble noble-updates noble-security' \
      'Components: main universe' \
      'Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg' \
      'Check-Valid-Until: no' \
      > /etc/apt/sources.list.d/ubuntu.sources \
    && install_packages() { \
         for attempt in 1 2 3 4 5; do \
           if apt-get update --error-on=any \
             && apt-get install -y --no-install-recommends \
               fonts-liberation fonts-noto-cjk poppler-utils; then return 0; fi; \
           [ "$attempt" -lt 5 ] || return 1; \
           sleep $((attempt * 20)); \
         done; \
       } \
    && if ! install_packages; then \
         echo 'WARNING: Ubuntu snapshot unavailable; falling back to official Noble archives' >&2; \
         rm -rf /var/lib/apt/lists/* \
         && printf '%s\n' \
           'Types: deb' \
           'URIs: https://archive.ubuntu.com/ubuntu/' \
           'Suites: noble noble-updates' \
           'Components: main universe' \
           'Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg' \
           '' \
           'Types: deb' \
           'URIs: https://security.ubuntu.com/ubuntu/' \
           'Suites: noble-security' \
           'Components: main universe' \
           'Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg' \
           > /etc/apt/sources.list.d/ubuntu.sources \
         && install_packages || exit 1; \
       fi \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=UTC LANG=C.UTF-8 LC_ALL=C.UTF-8 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /work
