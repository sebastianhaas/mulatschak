var socket = io('/lobby'); // io in namespace lobby

window.onload = function () {

    document.getElementById('addRoomBtn').onclick = addRoom;

    socket.on('update-room-list', function(data) {
        updateRoomList(data);
    });
};

//#region lobby functions
function addRoom() {
    var roomName = document.getElementById('room-name');
    if (roomName.value === '') {
        alert('Room name must not be empty!');
        return;
    }
    socket.emit('add-room', roomName.value);

    roomName.value = '';
    roomName.focus();
}

function updateRoomList(rooms) {
    var html = '';
    var badgeClass = '';
    var disabled = '';
    var hrefAttr = '';
    // iterate through room and create <a> tag with badges, disable anchor tag if max players reached
    rooms.forEach(room => {
        if (!room.availableSeats) {
            badgeClass = 'badge-danger';
            disabled = 'disabled';
            hrefAttr = '';
        } else {
            badgeClass = 'badge-success';
            disabled = '';
            hrefAttr = ' href="javascript:joinRoom(' + room.id + ');"';
        }
        // with href attribute register click listener
        html += '<a id="' + room.id + '" ' + hrefAttr + ' class="list-group-item list-group-item-action d-flex justify-content-between align-items-center ' + disabled + '">' + room.name + '<span class="badge ' + badgeClass + '">' + room.amountOfPlayers + '/4 Players</span></a>';

    });

    document.getElementById('availableRooms').innerHTML = html;
}

function joinRoom(id) {
    // function redirects to right rooom
    var username = document.getElementById('username').value;
    var url = './room.html?id=' + id + '&username=' + username;
 
    window.location.href = url; 
}

//#endregion lobby functions