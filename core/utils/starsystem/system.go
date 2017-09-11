package main

import (
	"log"
	"strconv"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
	"github.com/stardustapp/core/skylink"
	"github.com/stardustapp/core/toolbox"
)

type System struct {
	rootFolder base.Folder
	orbiter    *toolbox.Orbiter

	systemUri    string
	masterBinary string
	master       *Master
	processes    map[string]*Process
}

func LaunchSystem(masterBinary, systemUri string) {
	orbiter := toolbox.NewOrbiter(systemUri)
	orbiter.Put("/processes", inmem.NewFolder("processes"))

	/*
	  log.Println("Creating Stardust Orbiter...")
	  root := inmem.NewFolderOf("/",
	    inmem.NewFolderOf("master"),
	    inmem.NewFolderOf("processes"),
	  )
	  ns := base.NewNamespace("starsystem://", root)
	  ctx := base.NewRootContext(ns)*/

	s := &System{
		//rootFolder: root,
		orbiter:      orbiter,
		systemUri:    systemUri,
		masterBinary: masterBinary,
		processes:    make(map[string]*Process),
	}

	// Expose the API via Skylink
	log.Println("Starting nsexport...")
	exportBase, _ := s.orbiter.Get("/")
	skylink.NsexportFunc(s.orbiter, exportBase)

	// Run the master loop
	s.master = &Master{
		sys: s,
	}
	go s.master.Run()
}

// called regularly, sync from skylink endpoint to structure
func (s *System) syncProcesses() {
	confDir, _ := s.orbiter.GetFolder("/processes")
	for _, key := range confDir.Children() {
		_, ok := s.processes[key]
		if ok {
			// TODO: check if different
			continue
		}

		log.Println("configuring new process", key)
		commandStr, _ := s.orbiter.GetString("/processes/" + key + "/command")
		command := commandStr.Get()

		var arguments []string
		if argsDir, ok := s.orbiter.GetFolder("/processes/" + key + "/arguments"); ok {
			argIds := argsDir.Children()
			arguments = make([]string, len(argIds))
			for idx, _ := range argIds {
				argName := strconv.Itoa(idx + 1)
				argStr, _ := s.orbiter.GetString("/processes/" + key + "/arguments/" + argName)
				arguments[idx] = argStr.Get()
			}
		}

		p, err := StartProcess(key, command, arguments...)
		if err != nil {
			s.orbiter.Put("/processes/"+key+"/exit-reason",
				inmem.NewString("exit-reason", err.Error()))
			continue
		}
		s.processes[key] = p

		// record info
		s.orbiter.Put("/processes/"+key+"/pid",
			inmem.NewString("pid", strconv.Itoa(p.Pid)))

		go func() {
			if err := <-p.monitorCmd(); err != nil {
				s.orbiter.Put("/processes/"+key+"/exit-reason",
					inmem.NewString("exit-reason", err.Error()))
			}
			s.orbiter.Put("/processes/"+key+"/pid", nil)
		}()
	}

	// TODO: kill removed processes
}
