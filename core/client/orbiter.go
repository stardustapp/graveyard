package client

import (
  "log"
  "errors"

  "gopkg.in/resty.v0"
)

type Orbiter struct {
  base string
}

func NewOrbiter(starBase string) *Orbiter {
  resty.SetRedirectPolicy(resty.FlexibleRedirectPolicy(2))

  return &Orbiter{
    base: starBase,
  }
}

func (o *Orbiter) LoadFolder(path string) (fi FolderInfo, err error) {
  resp, err := resty.R(). // SetAuthToken
    SetHeader("Accept", "application/json"). // X-Sd-Match-Shape
    SetResult(&fi).
    Get(o.base + path + "/")

  if resp.StatusCode() < 200 || resp.StatusCode() > 399 {
    log.Println("got", resp.StatusCode(), "on", path)
    err = errors.New("Error HTTP status code")
  }
  return
}

type FolderInfo struct {
  Name string
  Children []FolderEntry
}

type FolderEntry struct {
  Name string
  Type string
  Shapes []string
  Size int
}

func (o *Orbiter) LoadEntry(path string) (err error, ent FolderEntry) {
  resp, err := resty.R().
    SetHeader("Accept", "application/json").
    SetResult(&ent).
    Get(o.base + path)

  if err == nil && (resp.StatusCode() < 200 || resp.StatusCode() > 399) {
    log.Println("got", resp.StatusCode(), "on", path)
    err = errors.New("Error HTTP status code")
  }
  return
}

func (o *Orbiter) ReadString(path string) (value string, err error) {
  data, err := o.ReadFile(path)
  return string(data), err
}

func (o *Orbiter) ReadFile(path string) (data []byte, err error) {
  resp, err := resty.R().
    SetHeader("Accept", "text/plain").
    Get(o.base + path)

  if err == nil && (resp.StatusCode() < 200 || resp.StatusCode() > 399) {
    log.Println("got", resp.StatusCode(), "on", path)
    err = errors.New("Error HTTP status code")
  }
  return resp.Body(), err
}

func (o *Orbiter) PutFile(path string, data []byte) (err error) {
  resp, err := resty.R().
    SetHeader("X-Sd-Entry-Type", "File").
    SetHeader("Content-Type", "text/plain").
    SetBody(data).
    Put(o.base + path)

  if err == nil && (resp.StatusCode() < 200 || resp.StatusCode() > 399) {
    log.Println("got", resp.StatusCode(), "on", path)
    err = errors.New("Error HTTP status code")
  }
  return err
}

func (o *Orbiter) PutFolder(path string) (err error) {
  resp, err := resty.R().
    SetHeader("X-Sd-Entry-Type", "Folder").
    Put(o.base + path)

  if err == nil && (resp.StatusCode() < 200 || resp.StatusCode() > 399) {
    log.Println("got", resp.StatusCode(), "on", path)
    err = errors.New("Error HTTP status code")
  }
  return err
}

func (o *Orbiter) Delete(path string) (err error) {
  resp, err := resty.R().
    Delete(o.base + path)

  if resp.StatusCode() < 200 || resp.StatusCode() > 399 {
    log.Println("got", resp.StatusCode(), "on", path)
    err = errors.New("Error HTTP status code")
  }
  return err
}

func (o *Orbiter) Rename(oldPath, newPath string) (err error) {
  resp, err := resty.R().
    SetHeader("Destination", newPath).
    Execute("MOVE", o.base + oldPath)

  if resp.StatusCode() < 200 || resp.StatusCode() > 399 {
    log.Println("got", resp.StatusCode(), "on", oldPath)
    err = errors.New("Error HTTP status code")
  }
  return err
}
