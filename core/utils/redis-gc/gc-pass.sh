#!/bin/sh -ex

rm -rf bin/
mkdir bin
for gofile in *.go; do
  go build -o bin/$gofile $gofile
done

time bin/list-all-entries.go > entry-list.tsv
time bin/walk-tree.go > root-tree.tsv
time bin/filter-with-tree.go > orphans.tsv # reads {entry-list,root-tree}.tsv
time bin/delete-orphans.go # reads orphans.tsv
