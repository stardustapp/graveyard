#!/bin/sh

gcloud dns record-sets \
  transaction start \
  --zone=devmodecloud

gcloud dns record-sets \
  transaction remove 104.196.244.167 34.83.242.55 35.201.111.60 \
  --name=devmode.cloud. \
  --ttl=300 \
  --type=A \
  --zone=devmodecloud

gcloud dns record-sets \
  transaction add 34.83.191.127 \
  --name=devmode.cloud. \
  --ttl=300 \
  --type=A \
  --zone=devmodecloud

gcloud dns record-sets \
  transaction execute \
  --zone=devmodecloud
