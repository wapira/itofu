#!/bin/sh
set -eu
exec "${JAVA_HOME}/bin/java" \
  -Djava.awt.headless=true \
  -Dsun.java2d.uiScale=1 \
  -Dfile.encoding=UTF-8 \
  --add-exports=java.desktop/sun.awt.image=ALL-UNNAMED \
  --enable-native-access=ALL-UNNAMED \
  "-Xmx${AUDIVERIS_HEAP:-2g}" \
  -cp '/opt/audiveris/app/audiveris.jar:/opt/audiveris/app/*:/opt/audiveris/app' \
  Audiveris "$@"
