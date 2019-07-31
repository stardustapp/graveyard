#!/bin/sh -ex
GitHash="$(git describe --always --long --dirty)"
Image="stardustapp/firebase-server"
GitImage="$Image:$GitHash"
docker build --build-arg GitHash="$GitHash" -t "$GitImage" .
docker push "$GitImage"
docker tag "$GitImage" "$Image:latest"
docker push "$Image:latest"
