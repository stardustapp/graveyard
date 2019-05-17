#!/bin/sh

gcloud container node-pools \
  create build \
  --disk-size 25GB \
  --enable-autorepair \
  --enable-autoupgrade \
  --image-type COS_CONTAINERD \
  --machine-type n1-standard-1 \
  --max-pods-per-node 25 \
  --num-nodes 1 \
  --node-taints cloud.google.com/gke-preemptible="true":NoSchedule \
  --preemptible \
  --service-account build-node@stardust-156404.iam.gserviceaccount.com
