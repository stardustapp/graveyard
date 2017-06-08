#!/bin/sh -ex

template=$(pwd)/vue-webpack

#pkill starfs
go install github.com/stardustapp/core/utils/starfs
starfs --stardust-base $STARDUST_BASE_URI &
StarFsPid=$!
sleep 2s

echo "starting test..."
cd /mnt/stardust
ls

cd tmp/
rm -rf app/
cp -r $template/ app/

cd app/
npm install --production
npm run build

kill $StarFsPid
