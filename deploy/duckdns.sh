#!/bin/sh
# Met à jour l'IP publique du sous-domaine DuckDNS (lancé toutes les 5 min par cron).
# Renseignez DOMAIN et TOKEN dans /etc/kjpictures/duckdns.env
. /etc/kjpictures/duckdns.env
curl -fsS "https://www.duckdns.org/update?domains=${DOMAIN}&token=${TOKEN}&ip=" -o /var/lib/kjpictures/duckdns.log
