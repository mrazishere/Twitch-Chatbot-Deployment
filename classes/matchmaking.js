// Class named Channel
class Matchmaking {
    constructor(status, mmList, teams) {
        this.status = status;
        this.mmList = mmList;
        this.teams = teams;
    }
    setStatus(status) {
        this.status = status;
    }
    setMmList(mmList) {
        this.mmList = mmList;
    }
    setTeams(teams) {
        this.teams = teams;
    }
    getStatus() {
        return this.status; 
    }
    getMmList() {
        return this.mmList;
    }
    getTeams() {
        return this.teams;
    }
    clearMmList() {
        this.mmList.splice(0, this.mmList.length);
    }
    clearTeams() {
        this.teams.splice(0, this.teams.length);
    }
}

module.exports = Matchmaking;