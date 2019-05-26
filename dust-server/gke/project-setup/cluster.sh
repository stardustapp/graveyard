#!/bin/sh

gcloud container \
  clusters create dust \
  --create-subnetwork name=dust \
  --disk-size 10GB \
  --default-max-pods-per-node 30 \
  --enable-ip-alias \
  --image-type COS \
  --machine-type g1-small \
  --maintenance-window 10:23 \
  --num-nodes 1 \
  --addons HorizontalPodAutoscaling
