package main

func (c *Client) Welcome() {
	c.SendServerMessage("001", c.nickname, "Welcome to the "+c.homeDomain+" Internet Relay Chat Headend "+c.nickname)
	c.SendServerMessage("002", c.nickname, "Your host is "+c.serverName+"["+c.serverName+"/6667], running bounce.go")
	c.SendServerMessage("003", c.nickname, "This server was created Wed Feb 17 22:23:45 UTC 2016")
	c.SendServerMessage("004", c.nickname, c.serverName, "stardust-irc-0.0.1", "DQRSZagiloswz", "CFILPQbcefgijklmnopqrstvz", "bkloveqjfI")
	c.SendServerMessage("005", c.nickname, "CPRIVMSG", "CNOTICE", "WHOX", "ETRACE", "MONITOR=100", "SAFELIST", "ELIST=CTU", "KNOCK", "FNC", "CHANTYPES=&#", "EXCEPTS", "INVEX", "are supported by this server")
	c.SendServerMessage("005", c.nickname, "CHANMODES=eIbq,k,flj,CFLPQcgimnprstz", "CHANLIMIT=&#:15", "PREFIX=(ov)@+", "MAXLIST=bqeI:100", "MODES=4", "NETWORK=Stardust", "STATUSMSG=@+", "CALLERID=g", "CASEMAPPING=rfc1459", "NICKLEN=30", "MAXNICKLEN=31", "CHANNELLEN=50", "are supported by this server")
	c.SendServerMessage("005", c.nickname, "TOPICLEN=390", "DEAF=D", "TARGMAX=NAMES:1,LIST:1,KICK:1,WHOIS:1,PRIVMSG:4,NOTICE:4,ACCEPT:,MONITOR:", "CLIENTVER=3.0", "are supported by this server")
	//c.SendServerMessage("251", c.nickname, "There are 0 users and 1 invisible on 1 servers")
	//c.SendServerMessage("255", c.nickname, "I have 1 clients and 0 servers")
	//c.SendServerMessage("265", c.nickname, "1", "1", "Current local users 1, max 1")
	//c.SendServerMessage("266", c.nickname, "1", "1", "Current global users 1, max 1")
	//c.SendServerMessage("250", c.nickname, "Highest connection count: 1 (1 clients) (1 netConnections received)")
	c.SendServerMessage("375", c.nickname, "- "+c.serverName+" Message of the Day -")
	c.SendServerMessage("372", c.nickname, "- Thank you for your attention.")
	c.SendServerMessage("376", c.nickname, "End of /MOTD command.")
}
