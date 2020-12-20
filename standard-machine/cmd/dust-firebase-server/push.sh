#!/bin/sh -ex
GitHash="$(git describe --always --long --dirty)"
#Image="stardustapp/firebase-server"
Image="gcr.io/stardust-156404/firebase-server"
GitImage="$Image:$GitHash"

docker build --build-arg GitHash="$GitHash" -t "$GitImage" .
docker push "$GitImage"
echo "$GitImage" > image-tag.txt

docker tag "$GitImage" "$Image:latest"
docker push "$Image:latest"
